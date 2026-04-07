const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { createBoardSchema } = require('../validators/boardValidator');
const { createBoard, getBoards, getBoardById } = require('../controllers/boardController');

// All board routes require authentication
router.use(authMiddleware);

router.post('/', validate(createBoardSchema), createBoard);
router.get('/', getBoards);
router.get('/:id', getBoardById);

module.exports = router;
