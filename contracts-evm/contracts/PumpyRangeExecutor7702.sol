// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IDreamDexBinaryPool {
    function placeBinaryOrder(
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint64 expireTimestampNs,
        uint8 orderType,
        uint8 selfMatchingOption,
        address builder,
        uint96 builderFeeBpsTimes1k,
        uint64 userData
    ) external payable returns (bool success, uint128 orderId);
}

interface IERC20Range {
    function balanceOf(address account) external view returns (uint256);
}

interface IERC6909Range {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/// @title PumpyRangeExecutor7702
/// @notice Atomically buys equal shares of YES(lower) and NO(upper) from two
/// DreamDEX binary pools when delegated onto the player's EOA with EIP-7702.
/// @dev The deployed implementation cannot execute or hold funds. Its bytecode
/// only runs through a self-call on the delegating wallet.
contract PumpyRangeExecutor7702 {
    uint8 internal constant BUY_YES = 0;
    uint8 internal constant BUY_NO = 2;
    uint8 internal constant FILL_OR_KILL = 1;
    uint8 internal constant CANCEL_TAKER = 0;

    address public immutable implementationAddress;

    struct RangeOrder {
        address collateral;
        address lowerPool;
        address upperPool;
        address lowerOutcomeToken;
        address upperOutcomeToken;
        uint256 lowerYesId;
        uint256 upperNoId;
        uint256 lowerYesPrice;
        uint256 upperYesPrice;
        uint256 quantity;
        uint256 lowerMaximumCost;
        uint256 upperMaximumCost;
        uint64 expireTimestampNs;
    }

    error DirectImplementationCall();
    error NotWalletSelfCall(address caller);
    error InvalidRangeOrder();
    error ApprovalFailed(address token, address spender);
    error LegRejected(address pool);
    error IncompleteFill(address pool, uint256 expected, uint256 received);
    error MaximumCostExceeded(uint256 maximum, uint256 spent);

    event RangeExecuted(
        address indexed player,
        address indexed lowerPool,
        address indexed upperPool,
        uint256 quantity,
        uint256 collateralSpent
    );

    constructor() {
        implementationAddress = address(this);
    }

    modifier onlyDelegatedSelf() {
        if (address(this) == implementationAddress) {
            revert DirectImplementationCall();
        }
        if (msg.sender != address(this)) revert NotWalletSelfCall(msg.sender);
        _;
    }

    function executeRange(
        RangeOrder calldata order
    ) external onlyDelegatedSelf returns (uint256 collateralSpent) {
        if (
            order.collateral == address(0) ||
            order.lowerPool == address(0) ||
            order.upperPool == address(0) ||
            order.lowerOutcomeToken == address(0) ||
            order.upperOutcomeToken == address(0) ||
            order.lowerPool == order.upperPool ||
            order.quantity == 0 ||
            order.lowerYesPrice == 0 ||
            order.upperYesPrice == 0 ||
            order.lowerMaximumCost == 0 ||
            order.upperMaximumCost == 0 ||
            order.expireTimestampNs == 0
        ) revert InvalidRangeOrder();

        uint256 collateralBefore = IERC20Range(order.collateral).balanceOf(
            address(this)
        );
        uint256 lowerBefore = IERC6909Range(order.lowerOutcomeToken).balanceOf(
            address(this),
            order.lowerYesId
        );
        uint256 upperBefore = IERC6909Range(order.upperOutcomeToken).balanceOf(
            address(this),
            order.upperNoId
        );

        _forceApprove(
            order.collateral,
            order.lowerPool,
            order.lowerMaximumCost
        );
        _place(
            order.lowerPool,
            BUY_YES,
            order.lowerYesPrice,
            order.quantity,
            order.expireTimestampNs
        );

        _forceApprove(
            order.collateral,
            order.upperPool,
            order.upperMaximumCost
        );
        _place(
            order.upperPool,
            BUY_NO,
            order.upperYesPrice,
            order.quantity,
            order.expireTimestampNs
        );

        uint256 lowerReceived =
            IERC6909Range(order.lowerOutcomeToken).balanceOf(
                address(this),
                order.lowerYesId
            ) -
            lowerBefore;
        uint256 upperReceived =
            IERC6909Range(order.upperOutcomeToken).balanceOf(
                address(this),
                order.upperNoId
            ) -
            upperBefore;
        if (lowerReceived != order.quantity) {
            revert IncompleteFill(
                order.lowerPool,
                order.quantity,
                lowerReceived
            );
        }
        if (upperReceived != order.quantity) {
            revert IncompleteFill(
                order.upperPool,
                order.quantity,
                upperReceived
            );
        }

        _forceApprove(order.collateral, order.lowerPool, 0);
        _forceApprove(order.collateral, order.upperPool, 0);

        uint256 collateralAfter = IERC20Range(order.collateral).balanceOf(
            address(this)
        );
        collateralSpent = collateralBefore - collateralAfter;
        uint256 maximumCost =
            order.lowerMaximumCost + order.upperMaximumCost;
        if (collateralSpent > maximumCost) {
            revert MaximumCostExceeded(maximumCost, collateralSpent);
        }

        emit RangeExecuted(
            address(this),
            order.lowerPool,
            order.upperPool,
            order.quantity,
            collateralSpent
        );
    }

    function _place(
        address pool,
        uint8 kind,
        uint256 yesPrice,
        uint256 quantity,
        uint64 expireTimestampNs
    ) private {
        (bool success, ) = IDreamDexBinaryPool(pool).placeBinaryOrder(
            kind,
            yesPrice,
            quantity,
            expireTimestampNs,
            FILL_OR_KILL,
            CANCEL_TAKER,
            address(0),
            0,
            0
        );
        if (!success) revert LegRejected(pool);
    }

    function _forceApprove(
        address token,
        address spender,
        uint256 amount
    ) private {
        (bool reset, bytes memory resetData) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, 0)
        );
        if (!reset || (resetData.length != 0 && !abi.decode(resetData, (bool)))) {
            revert ApprovalFailed(token, spender);
        }
        if (amount == 0) return;

        (bool approved, bytes memory approvedData) = token.call(
            abi.encodeWithSignature(
                "approve(address,uint256)",
                spender,
                amount
            )
        );
        if (
            !approved ||
            (approvedData.length != 0 && !abi.decode(approvedData, (bool)))
        ) revert ApprovalFailed(token, spender);
    }

    receive() external payable {}
}
