const ActivityLog = require('../models/ActivityLog');
const { startOfDay, endOfDay, subDays, startOfWeek } = require('date-fns');

/**
 * GET /api/activity-logs
 * Query: startDate, endDate, userId, module, action, page, limit
 * Default: last 7 days, page 1, limit 50
 */
const getLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const now = new Date();
    const defaultStart = startOfDay(subDays(now, 6));
    const defaultEnd = endOfDay(now);

    const startDate = req.query.startDate
      ? startOfDay(new Date(req.query.startDate))
      : defaultStart;
    const endDate = req.query.endDate
      ? endOfDay(new Date(req.query.endDate))
      : defaultEnd;

    const filter = {
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.module) filter.module = req.query.module;
    if (req.query.action) filter.action = req.query.action;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/activity-logs/stats
 */
const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    const [totalToday, totalThisWeek, byModuleAgg, byUserAgg, recentLogins] = await Promise.all([
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
      ActivityLog.countDocuments({ createdAt: { $gte: weekStart, $lte: todayEnd } }),
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: weekStart, $lte: todayEnd } } },
        { $group: { _id: '$module', count: { $sum: 1 } } },
      ]),
      ActivityLog.aggregate([
        { $match: { createdAt: { $gte: weekStart, $lte: todayEnd } } },
        { $group: { _id: '$userName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      ActivityLog.find({ action: 'LOGIN' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const byModule = {};
    byModuleAgg.forEach((row) => {
      byModule[row._id || 'Unknown'] = row.count;
    });

    const byUser = byUserAgg.map((row) => ({
      name: row._id || 'System',
      count: row.count,
    }));

    res.json({
      success: true,
      data: {
        totalToday,
        totalThisWeek,
        byModule,
        byUser,
        recentLogins,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLogs, getStats };
