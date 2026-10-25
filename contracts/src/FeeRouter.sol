// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPulseXRouter02 {
    function WPLS() external pure returns (address);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

/**
 * @title FeeRouter
 * @notice Routes the 1% PLS trade fee according to PRODUCT_BRIEF.md:
 *         - 50% -> swap PLS for USDC -> @Gain_Zee's address
 *         - 25% -> buy $UNIQ from its PLS pool -> burn (0x...dEaD)
 *         - 25% -> buy $UNIQ from its PLS pool -> @Gain_Zee's address
 *         - 0% to coin launchers, 0 migration reward.
 *         Recipient and router updates are protected behind a 2-day timelock.
 */
contract FeeRouter {
    error NotMultisig();
    error TimelockNotReady();
    error ZeroAddress();

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant TIMELOCK_DELAY = 2 days;

    address public multisig;
    address public devRecipient; // @Gain_Zee address
    address public router;       // PulseX V2 Router
    address public wpls;
    address public usdc;
    address public uniq;

    uint256 public totalFeesPls;
    uint256 public totalUsdcPlsRouted;
    uint256 public totalUniqBurnPlsRouted;
    uint256 public totalUniqDevPlsRouted;

    struct PendingUpdate {
        address newMultisig;
        address newDevRecipient;
        address newRouter;
        uint256 eta;
    }

    PendingUpdate public pending;

    event FeeRouted(
        address indexed curve,
        uint256 totalFeePls,
        uint256 usdcLegPls,
        uint256 uniqBurnLegPls,
        uint256 uniqDevLegPls
    );
    event UpdateQueued(address newMultisig, address newDevRecipient, address newRouter, uint256 eta);
    event UpdateExecuted(address newMultisig, address newDevRecipient, address newRouter);

    constructor(
        address _multisig,
        address _devRecipient,
        address _router,
        address _wpls,
        address _usdc,
        address _uniq
    ) {
        if (_multisig == address(0) || _devRecipient == address(0)) revert ZeroAddress();
        multisig = _multisig;
        devRecipient = _devRecipient;
        router = _router;
        wpls = _wpls;
        usdc = _usdc;
        uniq = _uniq;
    }

    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    /**
     * @notice Receives the 1% PLS trade fee from a BondingCurve and splits 50% / 25% / 25%.
     */
    function routeFee() external payable {
        uint256 feePls = msg.value;
        if (feePls == 0) return;

        uint256 usdcLeg = feePls / 2;               // 50%
        uint256 uniqBurnLeg = feePls / 4;           // 25%
        uint256 uniqDevLeg = feePls - usdcLeg - uniqBurnLeg; // 25%

        totalFeesPls += feePls;
        totalUsdcPlsRouted += usdcLeg;
        totalUniqBurnPlsRouted += uniqBurnLeg;
        totalUniqDevPlsRouted += uniqDevLeg;

        if (router != address(0) && wpls != address(0)) {
            if (usdc != address(0) && usdcLeg > 0) {
                _swapPlsForToken(usdcLeg, usdc, devRecipient);
            } else if (usdcLeg > 0) {
                (bool ok, ) = devRecipient.call{value: usdcLeg}("");
                require(ok, "FeeRouter: dev transfer failed");
            }

            if (uniq != address(0)) {
                if (uniqBurnLeg > 0) _swapPlsForToken(uniqBurnLeg, uniq, DEAD);
                if (uniqDevLeg > 0) _swapPlsForToken(uniqDevLeg, uniq, devRecipient);
            } else {
                if (uniqBurnLeg > 0) {
                    (bool ok1, ) = DEAD.call{value: uniqBurnLeg}("");
                    require(ok1, "FeeRouter: burn leg failed");
                }
                if (uniqDevLeg > 0) {
                    (bool ok2, ) = devRecipient.call{value: uniqDevLeg}("");
                    require(ok2, "FeeRouter: dev leg failed");
                }
            }
        } else {
            // Testnet / standalone mode without live DEX router configured yet
            if (usdcLeg + uniqDevLeg > 0) {
                (bool ok1, ) = devRecipient.call{value: usdcLeg + uniqDevLeg}("");
                require(ok1, "FeeRouter: dev fallback failed");
            }
            if (uniqBurnLeg > 0) {
                (bool ok2, ) = DEAD.call{value: uniqBurnLeg}("");
                require(ok2, "FeeRouter: burn fallback failed");
            }
        }

        emit FeeRouted(msg.sender, feePls, usdcLeg, uniqBurnLeg, uniqDevLeg);
    }

    function _swapPlsForToken(uint256 plsIn, address tokenOut, address recipient) internal {
        address[] memory path = new address[](2);
        path[0] = wpls;
        path[1] = tokenOut;
        IPulseXRouter02(router).swapExactETHForTokensSupportingFeeOnTransferTokens{value: plsIn}(
            0,
            path,
            recipient,
            block.timestamp
        );
    }

    function queueUpdate(address _newMultisig, address _newDevRecipient, address _newRouter) external onlyMultisig {
        if (_newMultisig == address(0) || _newDevRecipient == address(0)) revert ZeroAddress();
        uint256 eta = block.timestamp + TIMELOCK_DELAY;
        pending = PendingUpdate({
            newMultisig: _newMultisig,
            newDevRecipient: _newDevRecipient,
            newRouter: _newRouter,
            eta: eta
        });
        emit UpdateQueued(_newMultisig, _newDevRecipient, _newRouter, eta);
    }

    function executeUpdate() external onlyMultisig {
        if (pending.eta == 0 || block.timestamp < pending.eta) revert TimelockNotReady();
        multisig = pending.newMultisig;
        devRecipient = pending.newDevRecipient;
        router = pending.newRouter;
        delete pending;
        emit UpdateExecuted(multisig, devRecipient, router);
    }
}
