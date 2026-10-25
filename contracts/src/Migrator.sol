// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPulseXRouterLiquidity {
    function factory() external pure returns (address);
    function WPLS() external pure returns (address);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title Migrator
 * @notice At graduation (200,000,000 PLS real reserve), creates the PulseX pair,
 *         adds the curve's 200M PLS + 206.9M reserved tokens, and permanently burns
 *         the LP tokens to 0x000000000000000000000000000000000000dEaD.
 */
contract Migrator {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    string public constant LAUNCHPAD = "uniq.anon";

    address public immutable pulseXRouter;

    event MigratedToPulseX(
        address indexed coin,
        address indexed curve,
        address indexed pair,
        uint256 plsAdded,
        uint256 tokensAdded,
        uint256 lpBurned
    );

    constructor(address _pulseXRouter) {
        pulseXRouter = _pulseXRouter;
    }

    /**
     * @notice Called by BondingCurve upon reaching 200,000,000 PLS reserve.
     *         Caller transfers `tokenAmount` (206,900,000e18) to Migrator before calling with `msg.value` (200,000,000e18 PLS).
     */
    function migrate(address coin) external payable returns (address pair, uint256 liquidityBurned) {
        uint256 plsAmount = msg.value;
        uint256 tokenAmount = IERC20Minimal(coin).balanceOf(address(this));
        require(plsAmount > 0 && tokenAmount > 0, "Migrator: empty migration");

        if (pulseXRouter != address(0)) {
            IERC20Minimal(coin).approve(pulseXRouter, tokenAmount);
            address fac = IPulseXRouterLiquidity(pulseXRouter).factory();
            address wpls = IPulseXRouterLiquidity(pulseXRouter).WPLS();
            pair = IPulseXFactory(fac).getPair(coin, wpls);
            if (pair == address(0)) {
                pair = IPulseXFactory(fac).createPair(coin, wpls);
            }
            (, , liquidityBurned) = IPulseXRouterLiquidity(pulseXRouter).addLiquidityETH{value: plsAmount}(
                coin,
                tokenAmount,
                0,
                0,
                DEAD, // LP tokens minted directly to 0x...dEaD!
                block.timestamp
            );
        } else {
            // Standalone / local test mode when PulseX router is not deployed on local anvil:
            // Lock reserved tokens and PLS permanently at DEAD / Migrator
            IERC20Minimal(coin).transfer(DEAD, tokenAmount);
            pair = DEAD;
            liquidityBurned = plsAmount;
        }

        emit MigratedToPulseX(coin, msg.sender, pair, plsAmount, tokenAmount, liquidityBurned);
    }
}
