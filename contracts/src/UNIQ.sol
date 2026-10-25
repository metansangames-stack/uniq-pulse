// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title UNIQ
 * @notice Platform token for uniq.anon. Fixed supply of 1,000,000,000 $UNIQ.
 *         Fee buys on its PLS pool move the $UNIQ price; burns send tokens to 0x...dEaD (or reduce supply)
 *         without selling into the pool.
 */
contract UNIQ {
    string public constant name = "uniq.anon";
    string public constant symbol = "UNIQ";
    uint8 public constant decimals = 18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public totalSupply;
    uint256 public totalBurned;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Burned(address indexed burner, uint256 amount);

    constructor(address initialRecipient) {
        totalSupply = MAX_SUPPLY;
        balanceOf[initialRecipient] = MAX_SUPPLY;
        emit Transfer(address(0), initialRecipient, MAX_SUPPLY);
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
            require(allowed >= amount, "UNIQ: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @notice Permanently burns $UNIQ from `msg.sender` to the dead address.
     *         Does NOT interact with the PLS/$UNIQ pool, so burns never move the $UNIQ chart.
     */
    function burn(uint256 amount) external {
        _transfer(msg.sender, DEAD, amount);
        totalBurned += amount;
        emit Burned(msg.sender, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "UNIQ: zero address");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "UNIQ: balance too low");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
