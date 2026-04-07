const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { createColumn, updateColumn, deleteColumn } = require('../controllers/columnController');

router.use(authMiddleware);

router.post('/', createColumn);
router.put('/:id', updateColumn);
router.delete('/:id', deleteColumn);

module.exports = router;
