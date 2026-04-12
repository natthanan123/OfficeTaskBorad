const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { createBoardSchema } = require('../validators/boardValidator');
const { createBoard, getBoards, getBoardById } = require('../controllers/boardController');
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

module.exports = router;
