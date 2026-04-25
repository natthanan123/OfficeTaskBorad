const { Op } = require('sequelize');
const {
  Board,
  User,
  Column,
  Task,
  BoardMember,
  Label,
  TaskComment,
  Attachment,
  CommentReaction,
  sequelize,
} = require('../models');

exports.createBoard = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { title, description } = req.body;

    if (!title) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'title is required' });
    }

    const board = await Board.create(
      {
        title,
        description,
        creator_id: req.user.id,
      },
      { transaction: t }
    );

    await BoardMember.create(
      {
        user_id: req.user.id,
        board_id: board.id,
        role: 'owner',
        status: 'accepted',
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({ status: 'success', data: { board } });
  } catch (err) {
    await t.rollback();
    console.error('createBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create board' });
  }
};

exports.getBoards = async (req, res) => {
  try {
    const findOptions = {
      include: {
        model: User,
        as: 'creator',
        attributes: ['id', 'full_name', 'email'],
      },
      order: [['created_at', 'DESC']],
    };

    if (req.user.role !== 'admin') {
      findOptions.where = {
        [Op.or]: [
          { creator_id: req.user.id },
          {
            id: {
              [Op.in]: sequelize.literal(
                `(SELECT board_id FROM board_members WHERE user_id = :userId AND status = 'accepted')`
              ),
            },
          },
        ],
      };
      findOptions.replacements = { userId: req.user.id };
    }

    const boards = await Board.findAll(findOptions);
    return res.json({ status: 'success', data: { boards } });
  } catch (err) {
    console.error('getBoards error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch boards' });
  }
};

exports.getBoardById = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'email'],
        },
        {
          model: Column,
          as: 'columns',
          separate: true,
          order: [['position', 'ASC']],
          include: {
            model: Task,
            as: 'tasks',
            separate: true,
            order: [['position', 'ASC']],
            include: [
              {
                model: User,
                as: 'assignees',
                attributes: ['id', 'full_name', 'email'],
                through: { attributes: [] },
              },
              {
                model: Label,
                as: 'labels',
                through: { attributes: [] },
              },
              {
                model: TaskComment,
                as: 'comments',
                separate: true,
                order: [['created_at', 'ASC']],
                include: [
                  {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'full_name', 'email', 'profile_picture', 'avatar_url'],
                  },
                  {
                    model: CommentReaction,
                    as: 'reactions',
                    attributes: ['id', 'emoji', 'user_id'],
                  },
                ],
              },
              {
                model: Attachment,
                as: 'attachments',
                separate: true,
                order: [['created_at', 'DESC']],
              },
            ],
          },
        },
      ],
    });

    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    const raw = typeof board.toJSON === 'function' ? board.toJSON() : board;

    const safeColumns = (raw?.columns || raw?.Columns || []).map((column) => {
      const tasks = (column?.tasks || column?.Tasks || []).map((task) => ({
        ...task,
        assignees:   task?.assignees   || task?.Assignees   || [],
        labels:      task?.labels      || task?.Labels      || [],
        attachments: task?.attachments || task?.Attachments || [],
        comments:  (task?.comments || task?.Comments || []).map((c) => {
          const rawReactions = c?.reactions || c?.Reactions || [];
          const grouped = {};
          rawReactions.forEach(r => {
            const emoji = r.emoji;
            if (!grouped[emoji]) grouped[emoji] = { emoji, count: 0, user_ids: [] };
            grouped[emoji].count++;
            grouped[emoji].user_ids.push(r.user_id);
          });
          return {
            ...c,
            author: c?.author || c?.Author || null,
            reactions: Object.values(grouped),
          };
        }),
      }));
      return { ...column, tasks };
    });

    const safeBoard = { ...raw, columns: safeColumns };

    return res.json({ status: 'success', data: { board: safeBoard } });
  } catch (err) {
    console.error('getBoardById error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch board' });
  }
};

// PUT /:id — Update board fields (currently: title)
exports.updateBoard = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (req.user.role !== 'admin' && board.creator_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the board creator can update this board',
      });
    }

    const { title, description } = req.body || {};
    const updates = {};
    if (typeof title === 'string' && title.trim()) updates.title = title.trim();
    if (typeof description === 'string') updates.description = description;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    }

    await board.update(updates);

    try {
      req.app.get('io')
        .to(`board_${board.id}`)
        .emit('board_updated', { type: 'board_updated', board_id: board.id });
    } catch (socketErr) {
      console.error('socket emit (board_updated) failed:', socketErr);
    }

    return res.json({ status: 'success', data: { board } });
  } catch (err) {
    console.error('updateBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update board' });
  }
};

// POST /:id/duplicate — Clone a board with all columns, labels and tasks
exports.duplicateBoard = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const original = await Board.findByPk(req.params.id, {
      include: [
        {
          model: Column,
          as: 'columns',
          include: [{
            model: Task,
            as: 'tasks',
            include: [{ model: Label, as: 'labels', through: { attributes: [] } }],
          }],
        },
        { model: Label, as: 'labels' },
      ],
    });

    if (!original) {
      await t.rollback();
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    const newBoard = await Board.create({
      title: `${original.title} (copy)`,
      description: original.description,
      background: original.background,
      creator_id: req.user.id,
    }, { transaction: t });

    await BoardMember.create({
      user_id: req.user.id,
      board_id: newBoard.id,
      role: 'owner',
      status: 'accepted',
    }, { transaction: t });

    // Clone labels and keep an old->new id map for re-association on tasks
    const labelIdMap = new Map();
    const originalLabels = original.labels || [];
    for (const lbl of originalLabels) {
      const newLbl = await Label.create({
        board_id: newBoard.id,
        title: lbl.title,
        color: lbl.color,
      }, { transaction: t });
      labelIdMap.set(String(lbl.id), newLbl.id);
    }

    // Clone columns and their tasks (positions preserved)
    const originalColumns = (original.columns || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const col of originalColumns) {
      const newCol = await Column.create({
        board_id: newBoard.id,
        title: col.title,
        position: col.position,
        color: col.color,
      }, { transaction: t });

      const tasks = (col.tasks || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      for (const task of tasks) {
        const newTask = await Task.create({
          column_id: newCol.id,
          title: task.title,
          description: task.description,
          position: task.position,
          due_date: task.due_date,
          is_completed: task.is_completed,
        }, { transaction: t });

        const taskLabels = (task.labels || [])
          .map(l => labelIdMap.get(String(l.id)))
          .filter(Boolean);
        if (taskLabels.length && typeof newTask.setLabels === 'function') {
          await newTask.setLabels(taskLabels, { transaction: t });
        }
      }
    }

    await t.commit();
    return res.status(201).json({ status: 'success', data: { board: newBoard } });
  } catch (err) {
    await t.rollback();
    console.error('duplicateBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not duplicate board' });
  }
};

exports.deleteBoard = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (req.user.role !== 'admin' && board.creator_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the board creator can delete this board',
      });
    }

    const boardId = board.id;
    await board.destroy();

    try {
      req.app.get('io')
        .to(`board_${boardId}`)
        .emit('board_updated', { type: 'board_deleted', board_id: boardId });
    } catch (socketErr) {
      console.error('socket emit (board_deleted) failed:', socketErr);
    }

    return res.json({ status: 'success', data: { board_id: boardId } });
  } catch (err) {
    console.error('deleteBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete board' });
  }
};

exports.leaveBoard = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (board.creator_id === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'Board creator cannot leave their own board. Delete it instead.',
      });
    }

    const membership = await BoardMember.findOne({
      where: { user_id: req.user.id, board_id: board.id },
    });

    if (!membership) {
      return res.status(404).json({ status: 'error', message: 'You are not a member of this board' });
    }

    await membership.destroy();

    return res.json({ status: 'success', data: { board_id: board.id } });
  } catch (err) {
    console.error('leaveBoard error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not leave board' });
  }
};

exports.listBoardLabels = async (req, res) => {
  try {
    const labels = await Label.findAll({
      where: { board_id: req.params.id },
      order: [['created_at', 'ASC']],
    });
    return res.json({ status: 'success', data: { labels } });
  } catch (err) {
    console.error('listBoardLabels error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch labels' });
  }
};

exports.createBoardLabel = async (req, res) => {
  try {
    const { title, color } = req.body;
    if (!color) {
      return res.status(400).json({ status: 'error', message: 'color is required' });
    }

    const board = await Board.findByPk(req.params.id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    const label = await Label.create({
      board_id: board.id,
      title: title || null,
      color,
    });

    try {
      req.app.get('io')
        .to(`board_${board.id}`)
        .emit('board_updated', { type: 'label_created', board_id: board.id });
    } catch (socketErr) {
      console.error('socket emit (label_created) failed:', socketErr);
    }

    return res.status(201).json({ status: 'success', data: { label } });
  } catch (err) {
    console.error('createBoardLabel error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not create label' });
  }
};

exports.updateBackground = async (req, res) => {
  try {
    const board = await Board.findByPk(req.params.id);
    if (!board) {
      return res.status(404).json({ status: 'error', message: 'Board not found' });
    }

    if (req.user.role !== 'admin' && board.creator_id !== req.user.id) {
      return res.status(403).json({
        status: 'error',
        message: 'Only the board creator can update the background',
      });
    }

    let value = null;
    if (req.file) {
      value = `/uploads/avatars/${req.file.filename}`;
    } else if (req.body && typeof req.body.background === 'string' && req.body.background.trim()) {
      value = req.body.background.trim();
    }

    if (!value) {
      return res.status(400).json({
        status: 'error',
        message: 'background file or background string is required',
      });
    }

    await board.update({ background: value });

    try {
      req.app.get('io')
        .to(`board_${board.id}`)
        .emit('board_updated', { type: 'board_updated', board_id: board.id });
    } catch (socketErr) {
      console.error('socket emit (board_updated) failed:', socketErr);
    }

    return res.json({ status: 'success', data: { background: value } });
  } catch (err) {
    console.error('updateBackground error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update background' });
  }
};

exports.updateBoardLabel = async (req, res) => {
  try {
    const label = await Label.findByPk(req.params.labelId);
    if (!label) {
      return res.status(404).json({ status: 'error', message: 'Label not found' });
    }
    if (String(label.board_id) !== String(req.params.id)) {
      return res.status(404).json({ status: 'error', message: 'Label not found on this board' });
    }

    const { title, color } = req.body || {};
    const updates = {};
    if (typeof title !== 'undefined') updates.title = title || null;
    if (typeof color === 'string' && color.trim()) updates.color = color.trim();

    if (!Object.keys(updates).length) {
      return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    }

    await label.update(updates);

    try {
      req.app.get('io')
        .to(`board_${label.board_id}`)
        .emit('board_updated', { type: 'label_updated', board_id: label.board_id });
    } catch (socketErr) {
      console.error('socket emit (label_updated) failed:', socketErr);
    }

    return res.json({ status: 'success', data: { label } });
  } catch (err) {
    console.error('updateBoardLabel error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not update label' });
  }
};

exports.deleteBoardLabel = async (req, res) => {
  try {
    const label = await Label.findByPk(req.params.labelId);
    if (!label) {
      return res.status(404).json({ status: 'error', message: 'Label not found' });
    }
    if (String(label.board_id) !== String(req.params.id)) {
      return res.status(404).json({ status: 'error', message: 'Label not found on this board' });
    }

    const boardId = label.board_id;
    const labelId = label.id;
    await label.destroy();

    try {
      req.app.get('io')
        .to(`board_${boardId}`)
        .emit('board_updated', { type: 'label_deleted', board_id: boardId });
    } catch (socketErr) {
      console.error('socket emit (label_deleted) failed:', socketErr);
    }

    return res.json({ status: 'success', data: { label_id: labelId } });
  } catch (err) {
    console.error('deleteBoardLabel error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not delete label' });
  }
};

exports.listBoardMembers = async (req, res) => {
  try {
    const memberships = await BoardMember.findAll({
      where: { board_id: req.params.id, status: 'accepted' },
      include: {
        model: User,
        as: 'user',
        attributes: ['id', 'full_name', 'email'],
      },
      order: [['created_at', 'ASC']],
    });

    const members = memberships
      .map(m => m.user)
      .filter(Boolean);

    return res.json({ status: 'success', data: { members } });
  } catch (err) {
    console.error('listBoardMembers error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not fetch members' });
  }
};