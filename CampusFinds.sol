// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CampusFinds - lost-and-found board with reward escrow
/// @notice The owner of a lost item locks a reward in the contract. A finder
/// claims the item, and the reward is released only when the owner confirms.
contract CampusFinds {
    enum Status { Open, Claimed, Returned, Cancelled }

    struct Report {
        uint256 id;
        address payable reporter;
        address payable finder;
        string title;
        string location;
        string description;
        string claimNote;
        uint256 reward;
        uint64 createdAt;
        uint64 deadline;
        uint64 claimedAt;
        Status status;
    }

    address public immutable admin;
    uint256 public minReward;
    uint256 public reportCount;
    mapping(uint256 => Report) private reports;
    bool private locked;

    event ReportCreated(uint256 indexed id, address indexed reporter, uint256 reward, uint64 deadline);
    event ItemFound(uint256 indexed id, address indexed finder);
    event ClaimWithdrawn(uint256 indexed id, address indexed finder);
    event ClaimRejected(uint256 indexed id, address indexed finder);
    event ItemReturned(uint256 indexed id, address indexed finder, uint256 reward);
    event ReportCancelled(uint256 indexed id, address indexed reporter, uint256 reward);
    event DisputeResolved(uint256 indexed id, bool paidFinder);

    modifier validReport(uint256 id) {
        require(id >= 1 && id <= reportCount, "Report does not exist");
        _;
    }

    modifier onlyReporter(uint256 id) {
        require(msg.sender == reports[id].reporter, "Only the reporter");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(uint256 _minReward) {
        require(_minReward > 0, "Minimum reward must be positive");
        admin = msg.sender;
        minReward = _minReward;
    }

    /// @notice Post a lost item and lock the reward (msg.value) in escrow.
    function reportLost(
        string calldata title,
        string calldata location,
        string calldata description,
        uint256 durationDays
    ) external payable returns (uint256 id) {
        require(msg.value >= minReward, "Reward below minimum");
        require(bytes(title).length >= 1 && bytes(title).length <= 80, "Title must be 1-80 characters");
        require(bytes(location).length <= 80, "Location too long");
        require(bytes(description).length <= 300, "Description too long");
        require(durationDays >= 1 && durationDays <= 90, "Duration must be 1-90 days");

        id = ++reportCount;
        Report storage r = reports[id];
        r.id = id;
        r.reporter = payable(msg.sender);
        r.title = title;
        r.location = location;
        r.description = description;
        r.reward = msg.value;
        r.createdAt = uint64(block.timestamp);
        r.deadline = uint64(block.timestamp + durationDays * 1 days);
        r.status = Status.Open;
        emit ReportCreated(id, msg.sender, msg.value, r.deadline);
    }

    /// @notice Say you found the item. Anyone except the reporter may claim.
    function claimFound(uint256 id, string calldata note) external validReport(id) {
        Report storage r = reports[id];
        require(r.status == Status.Open, "Report is not open");
        require(msg.sender != r.reporter, "Reporter cannot claim own item");
        require(block.timestamp <= r.deadline, "Report has expired");
        require(bytes(note).length >= 1 && bytes(note).length <= 200, "Note must be 1-200 characters");

        r.finder = payable(msg.sender);
        r.claimNote = note;
        r.claimedAt = uint64(block.timestamp);
        r.status = Status.Claimed;
        emit ItemFound(id, msg.sender);
    }

    /// @notice Finder backs out; the report reopens.
    function withdrawClaim(uint256 id) external validReport(id) {
        Report storage r = reports[id];
        require(r.status == Status.Claimed, "Report is not claimed");
        require(msg.sender == r.finder, "Only the finder");
        _reopen(r);
        emit ClaimWithdrawn(id, msg.sender);
    }

    /// @notice Reporter says the claim is wrong; the report reopens.
    function rejectClaim(uint256 id) external validReport(id) onlyReporter(id) {
        Report storage r = reports[id];
        require(r.status == Status.Claimed, "Report is not claimed");
        address finder = r.finder;
        _reopen(r);
        emit ClaimRejected(id, finder);
    }

    /// @notice Reporter confirms the item is back; escrow is paid to the finder.
    function confirmReturn(uint256 id) external validReport(id) onlyReporter(id) nonReentrant {
        Report storage r = reports[id];
        require(r.status == Status.Claimed, "Report is not claimed");
        r.status = Status.Returned;
        emit ItemReturned(id, r.finder, r.reward);
        _pay(r.finder, r.reward);
    }

    /// @notice Reporter withdraws an unclaimed report and gets the reward back.
    function cancelReport(uint256 id) external validReport(id) onlyReporter(id) nonReentrant {
        Report storage r = reports[id];
        require(r.status == Status.Open, "Report is not open");
        r.status = Status.Cancelled;
        emit ReportCancelled(id, r.reporter, r.reward);
        _pay(r.reporter, r.reward);
    }

    /// @notice Admin settles a claimed report that the two sides cannot agree on.
    function resolveDispute(uint256 id, bool payFinder) external validReport(id) onlyAdmin nonReentrant {
        Report storage r = reports[id];
        require(r.status == Status.Claimed, "Report is not claimed");
        if (payFinder) {
            r.status = Status.Returned;
            emit ItemReturned(id, r.finder, r.reward);
            emit DisputeResolved(id, true);
            _pay(r.finder, r.reward);
        } else {
            r.status = Status.Cancelled;
            emit ReportCancelled(id, r.reporter, r.reward);
            emit DisputeResolved(id, false);
            _pay(r.reporter, r.reward);
        }
    }

    function getReport(uint256 id) external view validReport(id) returns (Report memory) {
        return reports[id];
    }

    function _reopen(Report storage r) private {
        r.finder = payable(address(0));
        r.claimNote = "";
        r.claimedAt = 0;
        r.status = Status.Open;
    }

    function _pay(address payable to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
