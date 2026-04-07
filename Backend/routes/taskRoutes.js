const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { createTask, updateTask, deleteTask } = require('../controllers/taskController');

router.use(authMiddleware);

router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;
