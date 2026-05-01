const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { createColumn, updateColumn, deleteColumn, copyColumn } = require('../controllers/columnController');

router.use(authMiddleware);

router.post('/', createColumn);
router.put('/:id', updateColumn);
router.delete('/:id', deleteColumn);
router.post('/:id/copy', copyColumn);

module.exports = router;
