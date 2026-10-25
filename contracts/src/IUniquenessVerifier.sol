// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IUniquenessVerifier
 * @notice Pluggable uniqueness check hook called by UsernameRegistry at signup.
 * @dev Intended for ProveX. ProveX is NOT built yet. Do not claim uniqueness proofs are live.
 */
interface IUniquenessVerifier {
    /**
     * @notice Returns true if the caller is permitted to bind `canonicalUsernameHash` to `wallet`.
     * @param wallet Address being bound to the username.
     * @param canonicalUsernameHash keccak256 hash of the canonicalized username.
     * @param proof Opaque proof bytes (unused while ProveX is not built).
     */
    function verifyUniqueness(
        address wallet,
        bytes32 canonicalUsernameHash,
        bytes calldata proof
    ) external view returns (bool);

    /**
     * @notice Explicitly reports whether a real uniqueness verifier (ProveX) is live.
     */
    function isLive() external pure returns (bool);
}

/**
 * @title NoOpUniquenessVerifier
 * @notice Stub verifier shipped until ProveX exists. Clearly reports `isLive() == false`.
 */
contract NoOpUniquenessVerifier is IUniquenessVerifier {
    function verifyUniqueness(address, bytes32, bytes calldata) external pure override returns (bool) {
        return true;
    }

    function isLive() external pure override returns (bool) {
        return false;
    }
}
