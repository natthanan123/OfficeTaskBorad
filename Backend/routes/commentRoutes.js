const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { updateComment, deleteComment } = require('../controllers/commentController');
const { toggleReaction, listReactions } = require('../controllers/reactionController');

router.use(authMiddleware);

// Comment CRUD
router.put('/:id',    updateComment);
router.delete('/:id', deleteComment);

// Reactions
router.get('/:id/reactions',  listReactions);
router.post('/:id/reactions', toggleReaction);

module.exports = router;
