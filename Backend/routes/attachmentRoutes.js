const router = require('express').Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { setCover, deleteAttachment } = require('../controllers/attachmentController');

router.use(authMiddleware);

router.put('/:id/set_cover', setCover);
router.delete('/:id',        deleteAttachment);

module.exports = router;
