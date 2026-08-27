// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockRangeCollateral {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockRangeOutcomes {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address account, uint256 id, uint256 amount) external {
        balanceOf[account][id] += amount;
    }
}

contract MockBinaryRangePool {
    MockRangeCollateral public immutable collateral;
    MockRangeOutcomes public immutable outcomes;
    uint256 public immutable outcomeId;
    uint256 public immutable costPerShare;
    uint256 public immutable one;

    bool public rejectOrder;
    bool public shortFill;

    constructor(
        address collateralAddress,
        address outcomeAddress,
        uint256 id,
        uint256 price,
        uint256 oneCollateral
    ) {
        collateral = MockRangeCollateral(collateralAddress);
        outcomes = MockRangeOutcomes(outcomeAddress);
        outcomeId = id;
        costPerShare = price;
        one = oneCollateral;
    }

    function configure(bool reject, bool makeShortFill) external {
        rejectOrder = reject;
        shortFill = makeShortFill;
    }

    function placeBinaryOrder(
        uint8,
        uint256,
        uint256 quantity,
        uint64,
        uint8 orderType,
        uint8,
        address,
        uint96,
        uint64
    ) external returns (bool success, uint128 orderId) {
        require(orderType == 1, "not FOK");
        if (rejectOrder) return (false, 0);

        uint256 received = shortFill ? quantity - 1 : quantity;
        uint256 cost = (received * costPerShare + one - 1) / one;
        collateral.transferFrom(msg.sender, address(this), cost);
        outcomes.mint(msg.sender, outcomeId, received);
        return (true, 0);
    }
}
