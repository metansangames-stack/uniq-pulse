// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsernameRegistry} from "./UsernameRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {Migrator} from "./Migrator.sol";

/**
 * @title UniqCoin
 * @notice Standard 1,000,000,000 supply ERC-20 created for each uniq.anon launch.
 *         While on the bonding curve (pre-graduation), peer-to-peer wallet transfers are locked
 *         so bundlers cannot buy on multiple accounts and consolidate or bypass the opening cap.
 *         Once graduated to PulseX, transfers unlock permanently.
 */
contract UniqCoin {
    error TransfersLockedUntilGraduation();
    error NotCurve();

    string public name;
    string public symbol;
    string public story;
    uint8 public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    // Pump.tires-parity immutable safety & DexScreener launchpad attribution constants
    string public constant LAUNCHPAD = "uniq.anon";
    address public constant owner = address(0); // Renounced at Block 0
    bool public constant IS_RENOUNCED = true;
    bool public constant HAS_BLACKLIST = false;
    bool public constant HAS_FREEZE = false;
    bool public constant CAN_MINT = false;
    uint256 public constant BUY_SELL_TAX_BPS = 0;

    address public immutable curve;
    bool public graduated;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Graduated();

    constructor(string memory _name, string memory _symbol, string memory _story, address _curve) {
        name = _name;
        symbol = _symbol;
        story = _story;
        curve = _curve;
        balanceOf[_curve] = TOTAL_SUPPLY;
        emit Transfer(address(0), _curve, TOTAL_SUPPLY);
    }

    function unlockForGraduation() external {
        if (msg.sender != curve) revert NotCurve();
        graduated = true;
        emit Graduated();
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "UniqCoin: allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        // Before graduation, only the bonding curve may send or receive tokens
        if (!graduated && from != curve && to != curve) {
            revert TransfersLockedUntilGraduation();
        }
        require(to != address(0), "UniqCoin: zero addr");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "UniqCoin: insufficient balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}

/**
 * @title BondingCurve
 * @notice Matches `src/lib/model.ts` and `CURVE_MATH.md` 1:1:
 *         - Constant-product with virtual reserves: `(V0 + reservePls) * (T0 - tokensSold) = K`
 *         - `TOTAL_SUPPLY = 1,000,000,000e18`
 *         - `CURVE_TOKENS = 793,100,000e18` (79.31% sold on curve; 206,900,000e18 reserved for PulseX LP)
 *         - `GRAD_PLS = 200,000,000e18`
 *         - `T0 = 1,073,000,000e18`, `T1 = 279,900,000e18`
 *         - `V0 = (GRAD_PLS * T1) / CURVE_TOKENS = 70,583,785,146891943008447862` wei
 *         - 1% fee BEFORE the curve on buys (`FILL_PLS = 200M / 0.99 = 202,020,202.0202... PLS`)
 *         - 1% fee on gross PLS output on sells
 *         - Anti-bundle opening cap: while `reservePls < 20,000,000e18`, each username can add at most
 *           `10,000,000e18` PLS total (`devFirstBuy` on launch is exempt).
 *         - Only registered usernames (`UsernameRegistry.isRegistered(trader)`) can trade.
 */
contract BondingCurve {
    error CurveGraduated();
    error ExpiredDeadline();
    error NotRegisteredUsername();
    error ZeroAmount();
    error OpeningCapExceeded();
    error SlippageExceeded();
    error InsufficientCurveReserve();
    error OnlyFactory();
    error ReentrancyGuard();

    uint256 private _locked = 1;
    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyGuard();
        _locked = 2;
        _;
        _locked = 1;
    }

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;
    uint256 public constant CURVE_TOKENS = 793_100_000 * 1e18;
    uint256 public constant LP_RESERVED_TOKENS = TOTAL_SUPPLY - CURVE_TOKENS; // 206,900,000e18
    uint256 public constant GRAD_PLS = 200_000_000 * 1e18;
    uint256 public constant T0 = 1_073_000_000 * 1e18;
    uint256 public constant T1 = T0 - CURVE_TOKENS; // 279,900,000e18
    uint256 public constant V0 = (GRAD_PLS * T1) / CURVE_TOKENS; // 70,583,785.146891943008447862 PLS
    uint256 public constant K = V0 * T0;

    uint256 public constant FEE_BPS = 100; // 1.00%
    uint256 public constant BPS_DENOM = 10_000;

    uint256 public constant OPEN_WINDOW_PLS = 200_000_000 * 1e18;
    uint256 public constant OPEN_CAP_PLS = 20_000_000 * 1e18;

    address public immutable factory;
    UniqCoin public immutable coin;
    UsernameRegistry public immutable usernameRegistry;
    FeeRouter public immutable feeRouter;
    Migrator public immutable migrator;

    uint256 public reservePls;
    uint256 public tokensSold;
    bool public graduated;
    address public pulseXPair;

    /// @notice Tracks PLS spent during the opening window (< 20M PLS) per canonical username hash
    mapping(bytes32 => uint256) public openingSpentByUser;

    event TradeExecuted(
        string username,
        bool isBuy,
        uint256 plsAmount,
        uint256 tokenAmount,
        uint256 feePls,
        uint256 newReservePls,
        uint256 newTokensSold,
        uint256 spotPricePls
    );
    event CurveGraduatedToPulseX(address indexed pair, uint256 reservePls, uint256 lpTokensReserved);

    constructor(
        string memory _name,
        string memory _ticker,
        string memory _story,
        address _usernameRegistry,
        address _feeRouter,
        address _migrator
    ) {
        factory = msg.sender;
        usernameRegistry = UsernameRegistry(_usernameRegistry);
        feeRouter = FeeRouter(_feeRouter);
        migrator = Migrator(_migrator);
        coin = new UniqCoin(_name, _ticker, _story, address(this));
    }

    /**
     * @notice Current spot price in wei of PLS per 1e18 token.
     */
    function pricePls() public view returns (uint256) {
        return ((V0 + reservePls) * 1e18) / (T0 - tokensSold);
    }

    /**
     * @notice Market cap counted in PLS (price * 1B supply). UI converts this to USD via live PLS/USD.
     */
    function mcapPls() external view returns (uint256) {
        return pricePls() * 1_000_000_000;
    }

    function inOpeningWindow() public view returns (bool) {
        return !graduated && reservePls < OPEN_WINDOW_PLS;
    }

    /**
     * @notice Max PLS spend (including 1% fee) needed to fill the remaining curve to 200M net PLS.
     */
    function spendToFill() public view returns (uint256) {
        if (graduated || reservePls >= GRAD_PLS) return 0;
        uint256 remainingNet = GRAD_PLS - reservePls;
        // ceil(remainingNet * 100 / 99)
        return (remainingNet * BPS_DENOM + (BPS_DENOM - FEE_BPS - 1)) / (BPS_DENOM - FEE_BPS);
    }

    /**
     * @notice Executed by UniqFactory during coin creation for the optional dev first buy (exempt from 10M opening cap).
     */
    function executeDevFirstBuy(address devTrader, uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (msg.sender != factory) revert OnlyFactory();
        return _buy(devTrader, msg.value, minTokensOut, true);
    }

    /**
     * @notice Buy tokens on the curve with PLS (`msg.value`).
     */
    function buy(uint256 minTokensOut, uint256 deadline) external payable nonReentrant returns (uint256 tokensOut) {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        return _buy(msg.sender, msg.value, minTokensOut, false);
    }

    function _buy(
        address trader,
        uint256 spendRequested,
        uint256 minTokensOut,
        bool isDevFirstBuy
    ) internal returns (uint256 tokensOut) {
        if (graduated) revert CurveGraduated();
        if (spendRequested == 0) revert ZeroAmount();
        if (!usernameRegistry.isRegistered(trader)) revert NotRegisteredUsername();

        uint256 maxFillSpend = spendToFill();
        uint256 spend = spendRequested > maxFillSpend ? maxFillSpend : spendRequested;
        uint256 refund = spendRequested - spend;

        bytes32 userHash = usernameRegistry.canonicalHashOf(trader);
        if (!isDevFirstBuy && inOpeningWindow()) {
            uint256 alreadySpent = openingSpentByUser[userHash];
            if (alreadySpent + spend > OPEN_CAP_PLS) revert OpeningCapExceeded();
            openingSpentByUser[userHash] = alreadySpent + spend;
        }

        uint256 fee = (spend * FEE_BPS) / BPS_DENOM;
        uint256 net = spend - fee;
        uint256 newReserve = reservePls + net;
        bool willGraduate = false;

        if (newReserve >= GRAD_PLS) {
            newReserve = GRAD_PLS;
            net = GRAD_PLS - reservePls;
            willGraduate = true;
        }

        if (willGraduate) {
            tokensOut = CURVE_TOKENS - tokensSold;
            reservePls = GRAD_PLS;
            tokensSold = CURVE_TOKENS;
            graduated = true;
        } else {
            uint256 tokensLeftAfter = K / (V0 + newReserve);
            tokensOut = (T0 - tokensSold) - tokensLeftAfter;
            reservePls = newReserve;
            tokensSold += tokensOut;
        }

        if (tokensOut < minTokensOut) revert SlippageExceeded();

        // Transfer bought tokens to trader
        coin.transfer(trader, tokensOut);

        // Route 1% fee to FeeRouter
        if (fee > 0) {
            feeRouter.routeFee{value: fee}();
        }

        emit TradeExecuted(
            usernameRegistry.usernameOf(trader),
            true,
            spend,
            tokensOut,
            fee,
            reservePls,
            tokensSold,
            pricePls()
        );

        // If curve reached 200M PLS, unlock coin transfers and migrate to PulseX with burned LP
        if (willGraduate) {
            coin.unlockForGraduation();
            coin.transfer(address(migrator), LP_RESERVED_TOKENS);
            (pulseXPair, ) = migrator.migrate{value: GRAD_PLS}(address(coin));
            emit CurveGraduatedToPulseX(pulseXPair, GRAD_PLS, LP_RESERVED_TOKENS);
        }

        // Refund any overfill PLS back to trader
        if (refund > 0) {
            (bool ok, ) = trader.call{value: refund}("");
            require(ok, "BondingCurve: refund failed");
        }
    }

    /**
     * @notice Sell `tokenAmount` back into the bonding curve for PLS (minus 1% fee).
     */
    function sell(uint256 tokenAmount, uint256 minPlsOut, uint256 deadline) external nonReentrant returns (uint256 plsOut) {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (graduated) revert CurveGraduated();
        if (tokenAmount == 0) revert ZeroAmount();
        if (!usernameRegistry.isRegistered(msg.sender)) revert NotRegisteredUsername();

        uint256 virtualPls = V0 + reservePls;
        uint256 grossPls = virtualPls - (K / (T0 - tokensSold + tokenAmount));
        if (grossPls == 0 || grossPls > reservePls) revert InsufficientCurveReserve();

        uint256 fee = (grossPls * FEE_BPS) / BPS_DENOM;
        plsOut = grossPls - fee;
        if (plsOut < minPlsOut) revert SlippageExceeded();

        // Pull tokens back into curve
        coin.transferFrom(msg.sender, address(this), tokenAmount);

        reservePls -= grossPls;
        tokensSold -= tokenAmount;

        if (fee > 0) {
            feeRouter.routeFee{value: fee}();
        }

        (bool ok, ) = msg.sender.call{value: plsOut}("");
        require(ok, "BondingCurve: PLS payout failed");

        emit TradeExecuted(
            usernameRegistry.usernameOf(msg.sender),
            false,
            plsOut,
            tokenAmount,
            fee,
            reservePls,
            tokensSold,
            pricePls()
        );
    }
}
