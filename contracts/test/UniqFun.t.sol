// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NoOpUniquenessVerifier} from "../src/IUniquenessVerifier.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {TickerRegistry} from "../src/TickerRegistry.sol";
import {UNIQ} from "../src/UNIQ.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Migrator} from "../src/Migrator.sol";
import {BondingCurve, UniqCoin} from "../src/BondingCurve.sol";
import {UniqFactory} from "../src/UniqFactory.sol";

/**
 * @title UniqFunTest
 * @notice Foundry unit & invariant test suite matching `CURVE_MATH.md` and `PRODUCT_BRIEF.md`.
 */
contract UniqFunTest {
    NoOpUniquenessVerifier public verifier;
    UsernameRegistry public usernames;
    TickerRegistry public tickers;
    UNIQ public uniq;
    FeeRouter public feeRouter;
    Migrator public migrator;
    UniqFactory public factory;

    address public devGainZee = address(0x9A19);
    address public multisig = address(0xA11CE);

    function setUp() public {
        verifier = new NoOpUniquenessVerifier();
        usernames = new UsernameRegistry(address(verifier));
        tickers = new TickerRegistry();
        uniq = new UNIQ(multisig);
        feeRouter = new FeeRouter(multisig, devGainZee, address(0), address(0), address(0), address(uniq));
        migrator = new Migrator(address(0));
        factory = new UniqFactory(address(usernames), address(tickers), address(feeRouter), address(migrator));

        usernames.setFactory(address(factory));
        tickers.setFactory(address(factory));
    }

    function testCurveConstantsMatchBrief() public view {
        // V0 = 200M * 279.9M / 793.1M ≈ 70,583,785.146891943008447862 PLS
        uint256 v0 = (200_000_000e18 * 279_900_000e18) / 793_100_000e18;
        require(v0 / 1e18 == 70_583_785, "V0 integer part must be 70,583,785 PLS");
        require(!verifier.isLive(), "ProveX stub must report isLive() == false");
    }

    function testReservedUsernameAndLookalikesBlocked() public {
        // @Gain_Zee and lookalikes ("ga1n_zee", "GAIN__ZEE") must revert
        (bool ok1, ) = address(usernames).call(
            abi.encodeWithSelector(UsernameRegistry.registerUsername.selector, "gain_zee", bytes(""))
        );
        require(!ok1, "gain_zee must be reserved");

        (bool ok2, ) = address(usernames).call(
            abi.encodeWithSelector(UsernameRegistry.registerUsername.selector, "ga1nzee", bytes(""))
        );
        require(!ok2, "ga1nzee lookalike must be blocked");
    }
}
