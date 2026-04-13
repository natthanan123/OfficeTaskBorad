const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  createTask,
  updateTask,
  deleteTask,
  toggleTaskComplete,
  setTaskDueDate,
  addTaskComment,
  toggleTaskLabel,
  assignTaskUser,
} = require('../controllers/taskController');

router.use(authMiddleware);

router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

// ── Phase 3: granular task detail endpoints ──
router.put('/:id/complete',  toggleTaskComplete);
router.put('/:id/due_date',  setTaskDueDate);
router.post('/:id/comments', addTaskComment);
router.post('/:id/labels',   toggleTaskLabel);
router.post('/:id/assign',   assignTaskUser);

module.exports = router;
