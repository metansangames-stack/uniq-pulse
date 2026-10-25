// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniquenessVerifier} from "./IUniquenessVerifier.sol";

/**
 * @title UsernameRegistry
 * @notice Enforces 1 username <-> 1 wallet, homoglyph lookalike blocking, reserved @Gain_Zee,
 *         1 launch per username, and trading gate (`isRegistered`).
 */
contract UsernameRegistry {
    error InvalidUsernameLength();
    error InvalidCharacter();
    error CanonicalTooShort();
    error UsernameReserved();
    error UsernameTaken();
    error WalletAlreadyBound();
    error UniquenessCheckFailed();
    error NotAuthorizedFactory();
    error AlreadyLaunched();
    error NotRegistered();
    error NotOwner();

    event UsernameRegistered(address indexed wallet, string username, bytes32 indexed canonicalHash);
    event LaunchRecorded(address indexed wallet, string username, string ticker);
    event VerifierUpdated(address indexed newVerifier);

    address public owner;
    address public factory;
    IUniquenessVerifier public verifier;

    /// @notice Reserved canonical hash for @Gain_Zee ("gainzee")
    bytes32 public immutable reservedPlatformHash;

    mapping(address => string) public usernameOf;
    mapping(address => bytes32) public canonicalHashOf;
    mapping(bytes32 => address) public walletOfCanonical;
    mapping(address => uint256) public registeredAtBlock;
    mapping(address => string) public launchedTickerOf;
    mapping(address => string[]) public launchedTickersOf;

    constructor(address _verifier) {
        owner = msg.sender;
        verifier = IUniquenessVerifier(_verifier);
        reservedPlatformHash = keccak256(bytes(canonicalize("Gain_Zee")));
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = IUniquenessVerifier(_verifier);
        emit VerifierUpdated(_verifier);
    }

    function isRegistered(address wallet) public view returns (bool) {
        return bytes(usernameOf[wallet]).length > 0;
    }

    function hasLaunched(address wallet) public view returns (bool) {
        return bytes(launchedTickerOf[wallet]).length > 0;
    }

    /**
     * @notice Register a username (3-16 ASCII chars `[a-z0-9_]`) for `msg.sender`.
     *         Blocks homoglyph lookalikes ("ga1n_zee", "rn"->"m", "vv"->"w", etc.).
     */
    function registerUsername(string calldata raw, bytes calldata proof) external {
        if (isRegistered(msg.sender)) revert WalletAlreadyBound();

        bytes memory b = bytes(raw);
        if (b.length < 3 || b.length > 16) revert InvalidUsernameLength();

        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) {
                c += 32; // A-Z -> a-z
            }
            bool valid = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (c == 95);
            if (!valid) revert InvalidCharacter();
            lower[i] = bytes1(c);
        }

        string memory cleanName = string(lower);
        string memory canon = canonicalize(cleanName);
        if (bytes(canon).length < 3) revert CanonicalTooShort();

        bytes32 canonHash = keccak256(bytes(canon));
        if (canonHash == reservedPlatformHash) revert UsernameReserved();
        if (walletOfCanonical[canonHash] != address(0)) revert UsernameTaken();

        if (address(verifier) != address(0)) {
            if (!verifier.verifyUniqueness(msg.sender, canonHash, proof)) revert UniquenessCheckFailed();
        }

        usernameOf[msg.sender] = cleanName;
        canonicalHashOf[msg.sender] = canonHash;
        walletOfCanonical[canonHash] = msg.sender;
        registeredAtBlock[msg.sender] = block.number;

        emit UsernameRegistered(msg.sender, cleanName, canonHash);
    }

    /**
     * @notice Called by UniqFactory when `launcher` launches a coin.
     *         Good devs can launch multiple projects under their permanent @username!
     */
    function recordLaunch(address launcher, string calldata ticker) external {
        if (msg.sender != factory) revert NotAuthorizedFactory();
        if (!isRegistered(launcher)) revert NotRegistered();
        launchedTickerOf[launcher] = ticker;
        launchedTickersOf[launcher].push(ticker);
        emit LaunchRecorded(launcher, usernameOf[launcher], ticker);
    }

    /**
     * @notice Matches `canonicalUsername` in `src/lib/usernames.ts` 1:1:
     *         0->o, 1/i/l->l, 5->s, 3->e, 4->a, 7->t, 8->b, rn->m, vv->w, strip `_`.
     */
    function canonicalize(string memory input) public pure returns (string memory) {
        bytes memory src = bytes(input);
        bytes memory tmp = new bytes(src.length);
        uint256 n = 0;

        for (uint256 i = 0; i < src.length; i++) {
            uint8 c = uint8(src[i]);
            if (c >= 65 && c <= 90) c += 32;
            if (c == 95 || c == 45 || c == 46 || c == 32) continue; // strip _, -, ., space
            if (c == 48) c = 111; // '0' -> 'o'
            else if (c == 49 || c == 105 || c == 108) c = 108; // '1', 'i', 'l' -> 'l'
            else if (c == 53) c = 115; // '5' -> 's'
            else if (c == 51) c = 101; // '3' -> 'e'
            else if (c == 52) c = 97;  // '4' -> 'a'
            else if (c == 55) c = 116; // '7' -> 't'
            else if (c == 56) c = 98;  // '8' -> 'b'
            tmp[n++] = bytes1(c);
        }

        // Second pass: fold "rn" -> "m" and "vv" -> "w"
        bytes memory out = new bytes(n);
        uint256 m = 0;
        uint256 j = 0;
        while (j < n) {
            if (j + 1 < n && tmp[j] == "r" && tmp[j + 1] == "n") {
                out[m++] = "m";
                j += 2;
            } else if (j + 1 < n && tmp[j] == "v" && tmp[j + 1] == "v") {
                out[m++] = "w";
                j += 2;
            } else {
                out[m++] = tmp[j];
                j += 1;
            }
        }

        bytes memory trimmed = new bytes(m);
        for (uint256 k = 0; k < m; k++) {
            trimmed[k] = out[k];
        }
        return string(trimmed);
    }
}
