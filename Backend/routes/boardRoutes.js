const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { createBoardSchema } = require('../validators/boardValidator');
const {
  createBoard,
  getBoards,
  getBoardById,
  updateBoard,
  duplicateBoard,
  deleteBoard,
  leaveBoard,
  listBoardLabels,
  createBoardLabel,
  updateBoardLabel,
  deleteBoardLabel,
  listBoardMembers,
  updateBackground,
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
router.put('/:id', updateBoard);
router.post('/:id/duplicate', duplicateBoard);
router.delete('/:id', deleteBoard);
router.delete('/:id/leave', leaveBoard);

router.post('/:id/invite',          inviteUserToBoard);
router.put('/:id/invite/respond',   respondToInvite);

router.get('/:id/labels',  listBoardLabels);
router.post('/:id/labels', createBoardLabel);
router.put('/:id/labels/:labelId',    updateBoardLabel);
router.delete('/:id/labels/:labelId', deleteBoardLabel);
router.get('/:id/members', listBoardMembers);

router.put('/:id/background', upload.single('background_image'), updateBackground);

router.get('/:id/logs', getBoardLogs);

module.exports = router;
