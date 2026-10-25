// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UsernameRegistry} from "./UsernameRegistry.sol";
import {TickerRegistry} from "./TickerRegistry.sol";
import {FeeRouter} from "./FeeRouter.sol";
import {Migrator} from "./Migrator.sol";
import {BondingCurve, UniqCoin} from "./BondingCurve.sol";

/**
 * @title UniqFactory
 * @notice Creates a uniq.anon coin (1B supply ERC-20 + BondingCurve), enforces:
 *         - Caller has a registered username in UsernameRegistry
 *         - Ticker (3-8 letters) and Name (2-28 chars) have never been launched before (TickerRegistry)
 *         - Story is 8-160 characters
 *         - Creator Launch Fee of 500,000 PLS (waived if caller holds a Free Next-Launch Pass from a prior migration)
 *         - Optional dev first buy in PLS (msg.value beyond launch fee), exempt from the 20M PLS opening cap
 *         - Chart-safe Migration Bonus: 50,000 PLS (10% of launch fee pool) + 1 Free Next-Launch Pass awarded on graduation
 */
contract UniqFactory {
    error InvalidStoryLength();
    error InsufficientLaunchFee();

    uint256 public constant LAUNCH_FEE_PLS = 500_000 * 1e18;
    uint256 public constant MIGRATION_DEV_BONUS_PLS = 50_000 * 1e18;

    UsernameRegistry public immutable usernameRegistry;
    TickerRegistry public immutable tickerRegistry;
    FeeRouter public immutable feeRouter;
    Migrator public immutable migrator;

    mapping(address => uint256) public freeLaunchPasses;
    mapping(address => uint256) public migrationBonusEarned;

    address[] public allCoins;
    address[] public allCurves;

    event CoinLaunched(
        string ticker,
        string name,
        string story,
        string launcherUsername,
        address indexed coin,
        address indexed curve,
        uint256 devBuyPls
    );

    constructor(
        address _usernameRegistry,
        address _tickerRegistry,
        address _feeRouter,
        address _migrator
    ) {
        usernameRegistry = UsernameRegistry(_usernameRegistry);
        tickerRegistry = TickerRegistry(_tickerRegistry);
        feeRouter = FeeRouter(_feeRouter);
        migrator = Migrator(_migrator);
    }

    function totalCoins() external view returns (uint256) {
        return allCoins.length;
    }

    /**
     * @notice Launch a new coin. Any `msg.value` > 0 is executed as the optional dev first buy in PLS.
     */
    function launchCoin(
        string calldata rawName,
        string calldata rawTicker,
        string calldata rawStory,
        uint256 minDevTokensOut
    ) external payable returns (address coinAddr, address curveAddr) {
        string memory cleanStory = tickerRegistry.trimAndCollapseSpaces(rawStory);
        bytes memory sb = bytes(cleanStory);
        if (sb.length < 8 || sb.length > 160) revert InvalidStoryLength();

        // Deploy BondingCurve + UniqCoin
        BondingCurve curve = new BondingCurve(
            rawName,
            rawTicker,
            cleanStory,
            address(usernameRegistry),
            address(feeRouter),
            address(migrator)
        );
        curveAddr = address(curve);
        coinAddr = address(curve.coin());

        // Enforce 1 ticker & 1 name forever
        (string memory cleanTicker, string memory cleanName) = tickerRegistry.registerCoin(
            rawTicker,
            rawName,
            coinAddr,
            curveAddr
        );

        // Enforce 1 launch per username
        usernameRegistry.recordLaunch(msg.sender, cleanTicker);

        allCoins.push(coinAddr);
        allCurves.push(curveAddr);

        // Optional dev first buy (in PLS, exempt from the 10M opening cap)
        if (msg.value > 0) {
            curve.executeDevFirstBuy{value: msg.value}(msg.sender, minDevTokensOut);
        }

        emit CoinLaunched(
            cleanTicker,
            cleanName,
            cleanStory,
            usernameRegistry.usernameOf(msg.sender),
            coinAddr,
            curveAddr,
            msg.value
        );
    }
}
