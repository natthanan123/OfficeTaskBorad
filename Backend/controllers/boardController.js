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
                include: {
                  model: User,
                  as: 'author',
                  attributes: ['id', 'full_name', 'email'],
                },
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
        comments:  (task?.comments || task?.Comments || []).map((c) => ({
          ...c,
          author: c?.author || c?.Author || null,
        })),
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