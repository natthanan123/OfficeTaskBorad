const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { attachmentUpload } = require('../middlewares/uploadMiddleware');
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
const {
  uploadAttachment,
  addLinkAttachment,
  listAttachments,
} = require('../controllers/attachmentController');

router.use(authMiddleware);

router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

router.put('/:id/complete',  toggleTaskComplete);
router.put('/:id/due_date',  setTaskDueDate);
router.post('/:id/comments', addTaskComment);
router.post('/:id/labels',   toggleTaskLabel);
router.post('/:id/assign',   assignTaskUser);

// Attachments scoped to a task.
router.get('/:task_id/attachments',       listAttachments);
router.post('/:task_id/attachments',      attachmentUpload.single('file'), uploadAttachment);
router.post('/:task_id/attachments/link', addLinkAttachment);

module.exports = router;
