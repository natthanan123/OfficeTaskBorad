const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { updateComment, deleteComment } = require('../controllers/commentController');

router.use(authMiddleware);

router.put('/:id',    updateComment);
router.delete('/:id', deleteComment);

module.exports = router;
