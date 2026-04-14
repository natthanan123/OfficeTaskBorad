const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { createBoardSchema } = require('../validators/boardValidator');
const {
  createBoard,
  getBoards,
  getBoardById,
  deleteBoard,
  leaveBoard,
  listBoardLabels,
  createBoardLabel,
  listBoardMembers,
} = require('../controllers/boardController');
const {
  inviteUserToBoard,
  respondToInvite,
} = require('../controllers/boardMemberController');
const { getBoardLogs } = require('../controllers/activityLogController');

// All board routes require authentication
router.use(authMiddleware);

router.post('/', validate(createBoardSchema), createBoard);
router.get('/', getBoards);
router.get('/:id', getBoardById);
router.delete('/:id', deleteBoard);
router.delete('/:id/leave', leaveBoard);

// ── Invite system ──
router.post('/:id/invite',          inviteUserToBoard);
router.put('/:id/invite/respond',   respondToInvite);

// ── Phase 3: labels + members lookup for the Task Detail Modal popups ──
router.get('/:id/labels',  listBoardLabels);
router.post('/:id/labels', createBoardLabel);
router.get('/:id/members', listBoardMembers);

// ── Activity log (audit trail) for a single board ──
router.get('/:id/logs', getBoardLogs);

module.exports = router;
