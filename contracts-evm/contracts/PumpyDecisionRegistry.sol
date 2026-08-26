// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PumpyDecisionRegistry
/// @notice Records immutable bot decisions before a player commits to a Pumpy round.
/// @dev This contract intentionally holds no funds and makes no claim about trade profitability.
contract PumpyDecisionRegistry {
    uint16 public constant MAX_CONFIDENCE_BPS = 10_000;

    struct Decision {
        address bot;
        bytes32 marketId;
        bytes32 strategyId;
        bytes32 modelHash;
        uint16 confidenceBps;
        uint8 side;
        uint64 registeredAt;
        uint64 expiresAt;
    }

    address public immutable owner;

    mapping(address bot => bool authorized) public isBot;
    mapping(bytes32 decisionId => Decision decision) private decisions;

    error Unauthorized(address caller);
    error ZeroAddress();
    error InvalidIdentifier();
    error InvalidSide(uint8 side);
    error InvalidConfidence(uint16 confidenceBps);
    error InvalidExpiry(uint64 expiresAt);
    error DecisionAlreadyExists(bytes32 decisionId);

    event BotAuthorizationUpdated(address indexed bot, bool authorized);
    event DecisionRegistered(
        bytes32 indexed decisionId,
        address indexed bot,
        bytes32 indexed marketId,
        bytes32 strategyId,
        bytes32 modelHash,
        uint16 confidenceBps,
        uint8 side,
        uint64 registeredAt,
        uint64 expiresAt
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyBot() {
        if (!isBot[msg.sender]) revert Unauthorized(msg.sender);
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
    }

    /// @notice Authorize or revoke a bot wallet. Authorization never grants custody powers.
    function setBot(address bot, bool authorized) external onlyOwner {
        if (bot == address(0)) revert ZeroAddress();
        isBot[bot] = authorized;
        emit BotAuthorizationUpdated(bot, authorized);
    }

    /// @notice Derive the immutable decision key used by the registry and DreamDEX metadata.
    function decisionIdFor(
        address bot,
        bytes32 marketId
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(bot, marketId));
    }

    /// @notice Register one immutable UP/DOWN decision for a bot and market.
    /// @dev One decision per bot/market prevents selective reveal across player matches.
    /// @param side 0 for UP and 1 for DOWN.
    /// @param modelHash Hash of the canonical model inputs and human-readable rationale payload.
    function registerDecision(
        bytes32 marketId,
        bytes32 strategyId,
        uint8 side,
        uint16 confidenceBps,
        bytes32 modelHash,
        uint64 expiresAt
    ) external onlyBot returns (bytes32 decisionId) {
        if (
            marketId == bytes32(0) ||
            strategyId == bytes32(0) ||
            modelHash == bytes32(0)
        ) revert InvalidIdentifier();
        if (side > 1) revert InvalidSide(side);
        if (confidenceBps > MAX_CONFIDENCE_BPS) {
            revert InvalidConfidence(confidenceBps);
        }
        if (expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        decisionId = decisionIdFor(msg.sender, marketId);
        if (decisions[decisionId].bot != address(0)) {
            revert DecisionAlreadyExists(decisionId);
        }

        uint64 registeredAt = uint64(block.timestamp);
        decisions[decisionId] = Decision({
            bot: msg.sender,
            marketId: marketId,
            strategyId: strategyId,
            modelHash: modelHash,
            confidenceBps: confidenceBps,
            side: side,
            registeredAt: registeredAt,
            expiresAt: expiresAt
        });

        emit DecisionRegistered(
            decisionId,
            msg.sender,
            marketId,
            strategyId,
            modelHash,
            confidenceBps,
            side,
            registeredAt,
            expiresAt
        );
    }

    function getDecision(bytes32 decisionId) external view returns (Decision memory) {
        return decisions[decisionId];
    }

    function hasDecision(bytes32 decisionId) external view returns (bool) {
        return decisions[decisionId].bot != address(0);
    }
}
