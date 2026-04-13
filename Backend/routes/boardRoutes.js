const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { createBoardSchema } = require('../validators/boardValidator');
const {
  createBoard,
  getBoards,
  getBoardById,
  listBoardLabels,
  createBoardLabel,
  listBoardMembers,
} = require('../controllers/boardController');
const {
  inviteUserToBoard,
  respondToInvite,
} = require('../controllers/boardMemberController');

// All board routes require authentication
router.use(authMiddleware);

router.post('/', validate(createBoardSchema), createBoard);
router.get('/', getBoards);
router.get('/:id', getBoardById);

// ── Invite system ──
router.post('/:id/invite',          inviteUserToBoard);
router.put('/:id/invite/respond',   respondToInvite);

// ── Phase 3: labels + members lookup for the Task Detail Modal popups ──
router.get('/:id/labels',  listBoardLabels);
router.post('/:id/labels', createBoardLabel);
router.get('/:id/members', listBoardMembers);

module.exports = router;
