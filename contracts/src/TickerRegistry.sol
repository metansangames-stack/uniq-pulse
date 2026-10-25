// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TickerRegistry
 * @notice Enforces uniq.anon's core rule: "Each ticker launches once."
 *         Every normalized ticker (3-8 letters) and every normalized coin name (2-28 chars)
 *         can be registered only once, forever.
 */
contract TickerRegistry {
    error NotOwner();
    error NotAuthorizedFactory();
    error InvalidTicker();
    error InvalidNameLength();
    error TickerAlreadyLaunched();
    error NameAlreadyLaunched();

    event TickerRetiredForever(string ticker, string name, address indexed coin, address indexed curve);

    address public owner;
    address public factory;

    mapping(bytes32 => address) public coinOfTickerHash;
    mapping(bytes32 => address) public coinOfNameHash;
    string[] public retiredTickers;

    constructor() {
        owner = msg.sender;
    }

    function setFactory(address _factory) external {
        if (msg.sender != owner) revert NotOwner();
        factory = _factory;
    }

    function retiredTickerCount() external view returns (uint256) {
        return retiredTickers.length;
    }

    function isTickerTaken(string calldata rawTicker) external view returns (bool) {
        string memory norm = normalizeTicker(rawTicker);
        return coinOfTickerHash[keccak256(bytes(norm))] != address(0);
    }

    function isNameTaken(string calldata rawName) external view returns (bool) {
        string memory norm = normalizeNameLower(rawName);
        return coinOfNameHash[keccak256(bytes(norm))] != address(0);
    }

    function registerCoin(
        string calldata rawTicker,
        string calldata rawName,
        address coin,
        address curve
    ) external returns (string memory cleanTicker, string memory cleanName) {
        if (msg.sender != factory) revert NotAuthorizedFactory();

        cleanTicker = normalizeTicker(rawTicker);
        bytes memory tb = bytes(cleanTicker);
        if (tb.length < 3 || tb.length > 8) revert InvalidTicker();

        cleanName = trimAndCollapseSpaces(rawName);
        bytes memory nb = bytes(cleanName);
        if (nb.length < 2 || nb.length > 28) revert InvalidNameLength();

        bytes32 tickerHash = keccak256(tb);
        bytes32 nameHash = keccak256(bytes(normalizeNameLower(cleanName)));

        if (coinOfTickerHash[tickerHash] != address(0)) revert TickerAlreadyLaunched();
        if (coinOfNameHash[nameHash] != address(0)) revert NameAlreadyLaunched();

        coinOfTickerHash[tickerHash] = coin;
        coinOfNameHash[nameHash] = coin;
        retiredTickers.push(cleanTicker);

        emit TickerRetiredForever(cleanTicker, cleanName, coin, curve);
    }

    function normalizeTicker(string calldata raw) public pure returns (string memory) {
        bytes memory b = bytes(raw);
        // Trim leading/trailing spaces
        uint256 start = 0;
        uint256 end = b.length;
        while (start < end && b[start] == 0x20) start++;
        while (end > start && b[end - 1] == 0x20) end--;

        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 97 && c <= 122) c -= 32; // a-z -> A-Z
            if (c < 65 || c > 90) revert InvalidTicker();
            out[i - start] = bytes1(c);
        }
        return string(out);
    }

    function trimAndCollapseSpaces(string calldata raw) public pure returns (string memory) {
        bytes memory b = bytes(raw);
        bytes memory tmp = new bytes(b.length);
        uint256 n = 0;
        bool inSpace = true;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c == 32 || c == 9 || c == 10 || c == 13) {
                if (!inSpace) {
                    tmp[n++] = 0x20;
                    inSpace = true;
                }
            } else {
                tmp[n++] = bytes1(c);
                inSpace = false;
            }
        }
        if (n > 0 && tmp[n - 1] == 0x20) n--;
        bytes memory out = new bytes(n);
        for (uint256 j = 0; j < n; j++) out[j] = tmp[j];
        return string(out);
    }

    function normalizeNameLower(string memory raw) public pure returns (string memory) {
        bytes memory b = bytes(raw);
        bytes memory out = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 65 && c <= 90) c += 32;
            out[i] = bytes1(c);
        }
        return string(out);
    }
}
