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
const { parseTrelloExport } = require('../utils/trelloImporter');

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

//Duplicate Board
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
            include: [
              { model: Label, as: 'labels', through: { attributes: [] } },
              { model: User,  as: 'assignees', attributes: ['id'], through: { attributes: [] } },
              { model: Attachment, as: 'attachments' },
              {
                model: TaskComment,
                as: 'comments',
                include: [{ model: CommentReaction, as: 'reactions' }],
              },
            ],
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

    //Labels
    const labelIdMap = new Map();
    for (const lbl of (original.labels || [])) {
      const newLbl = await Label.create({
        board_id: newBoard.id,
        title: lbl.title,
        color: lbl.color,
      }, { transaction: t });
      labelIdMap.set(String(lbl.id), newLbl.id);
    }

    //Columns + tasks
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

        //Labels
        const taskLabels = (task.labels || [])
          .map(l => labelIdMap.get(String(l.id)))
          .filter(Boolean);
        if (taskLabels.length && typeof newTask.setLabels === 'function') {
          await newTask.setLabels(taskLabels, { transaction: t });
        }

        //Assignees
        const assigneeIds = (task.assignees || []).map(u => u.id).filter(Boolean);
        if (assigneeIds.length && typeof newTask.setAssignees === 'function') {
          await newTask.setAssignees(assigneeIds, { transaction: t });
        }

        //Attachments
        for (const att of (task.attachments || [])) {
          await Attachment.create({
            task_id:          newTask.id,
            user_id:          att.user_id || null,
            filename_or_url:  att.filename_or_url,
            mimetype:         att.mimetype,
            size:             att.size,
            is_cover:         att.is_cover,
            source:           att.source || 'direct_upload',
          }, { transaction: t });
        }

        //Comments
        const commentIdMap = new Map();
        const orderedComments = (task.comments || []).slice().sort((a, b) => {
          const ad = new Date(a.created_at || 0).getTime();
          const bd = new Date(b.created_at || 0).getTime();
          return ad - bd;
        });
        //Top-level
        for (const c of orderedComments) {
          if (c.parent_id) continue;
          const newC = await TaskComment.create({
            task_id: newTask.id,
            user_id: c.user_id,
            content: c.content,
            parent_id: null,
          }, { transaction: t });
          commentIdMap.set(String(c.id), newC.id);
          for (const r of (c.reactions || [])) {
            await CommentReaction.create({
              comment_id: newC.id,
              user_id:    r.user_id,
              emoji:      r.emoji,
            }, { transaction: t });
          }
        }
        //Replies
        for (const c of orderedComments) {
          if (!c.parent_id) continue;
          const newParent = commentIdMap.get(String(c.parent_id));
          if (!newParent) continue;
          const newC = await TaskComment.create({
            task_id: newTask.id,
            user_id: c.user_id,
            content: c.content,
            parent_id: newParent,
          }, { transaction: t });
          commentIdMap.set(String(c.id), newC.id);
          for (const r of (c.reactions || [])) {
            await CommentReaction.create({
              comment_id: newC.id,
              user_id:    r.user_id,
              emoji:      r.emoji,
            }, { transaction: t });
          }
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

//Trello import
exports.importFromTrello = async (req, res) => {
  let payload = null;

  if (req.file && req.file.buffer) {
    try {
      payload = JSON.parse(req.file.buffer.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ status: 'error', message: 'Uploaded file is not valid JSON' });
    }
  } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
    payload = req.body;
  } else {
    return res.status(400).json({ status: 'error', message: 'No Trello JSON provided' });
  }

  let parsed;
  try {
    parsed = parseTrelloExport(payload);
  } catch (e) {
    return res.status(400).json({ status: 'error', message: e.message || 'Could not parse Trello export' });
  }

  //Override title
  const overrideTitle = (req.body && typeof req.body.title === 'string' && req.body.title.trim())
    || (req.query && typeof req.query.title === 'string' && req.query.title.trim())
    || null;

  const t = await sequelize.transaction();
  try {
    const newBoard = await Board.create({
      title: overrideTitle || parsed.board.title,
      description: parsed.board.description,
      creator_id: req.user.id,
    }, { transaction: t });

    await BoardMember.create({
      user_id: req.user.id,
      board_id: newBoard.id,
      role: 'owner',
      status: 'accepted',
    }, { transaction: t });

    //Labels
    const labelIdMap = new Map();
    for (const lbl of parsed.labels) {
      const created = await Label.create({
        board_id: newBoard.id,
        title: lbl.title,
        color: lbl.color,
      }, { transaction: t });
      labelIdMap.set(lbl.trelloId, created.id);
    }

    let columnsCreated = 0;
    let tasksCreated   = 0;

    for (const col of parsed.columns) {
      const newCol = await Column.create({
        board_id: newBoard.id,
        title: col.title,
        position: col.position,
        color: col.color || null,
      }, { transaction: t });
      columnsCreated++;

      for (const card of col.cards) {
        const newTask = await Task.create({
          column_id: newCol.id,
          title: card.title,
          description: card.description,
          position: card.position,
          due_date: card.due_date,
          is_completed: card.is_completed,
        }, { transaction: t });
        tasksCreated++;

        const taskLabelIds = (card.labelTrelloIds || [])
          .map(tid => labelIdMap.get(tid))
          .filter(Boolean);
        if (taskLabelIds.length && typeof newTask.setLabels === 'function') {
          await newTask.setLabels(taskLabelIds, { transaction: t });
        }
      }
    }

    await t.commit();
    return res.status(201).json({
      status: 'success',
      data: {
        board: newBoard,
        stats: {
          columns: columnsCreated,
          tasks:   tasksCreated,
          labels:  parsed.labels.length,
        },
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('importFromTrello error:', err);
    return res.status(500).json({ status: 'error', message: 'Could not import Trello board' });
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

    const isCreator = String(board.creator_id) === String(req.user.id);
    const isAdmin   = req.user.role === 'admin';
    let isMember = false;
    if (!isCreator && !isAdmin) {
      const membership = await BoardMember.findOne({
        where: { board_id: board.id, user_id: req.user.id, status: 'accepted' },
      });
      isMember = !!membership;
    }
    if (!isCreator && !isAdmin && !isMember) {
      return res.status(403).json({
        status: 'error',
        message: 'Only board members can update the background',
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