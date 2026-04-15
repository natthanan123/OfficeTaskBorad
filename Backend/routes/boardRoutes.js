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

router.use(authMiddleware);

router.post('/', validate(createBoardSchema), createBoard);
router.get('/', getBoards);
router.get('/:id', getBoardById);
router.delete('/:id', deleteBoard);
router.delete('/:id/leave', leaveBoard);

router.post('/:id/invite',          inviteUserToBoard);
router.put('/:id/invite/respond',   respondToInvite);

router.get('/:id/labels',  listBoardLabels);
router.post('/:id/labels', createBoardLabel);
router.get('/:id/members', listBoardMembers);

router.get('/:id/logs', getBoardLogs);

module.exports = router;
