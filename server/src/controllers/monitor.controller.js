
const {
  checkWebsite,
  checkRegisteredWebsite,
  getMonitoringHistory,
  getMonitoringStats,
} = require('../services/monitor.service');
const { WebsiteUrlError } = require('../services/url-security.service');
const { isValidUUID } = require('../utils/validation');

const parseGeneration = (value) => {
  if (value === undefined) return { valid: true, generation: undefined };
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    return { valid: false };
  }

  return { valid: true, generation: Number(value) };
};

const monitorWebsite = async (req, res) => {
  try {
    const { url } = req.body;

    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Website URL is required',
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid URL',
      });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        message: 'Only HTTP and HTTPS URLs are supported',
      });
    }

    const result = await checkWebsite(parsedUrl.toString());

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof WebsiteUrlError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error('Website monitoring error:', error);

    return res.status(500).json({
      success: false,
      message: 'Website monitoring failed',
    });
  }
};

const monitorRegisteredWebsite = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid website ID',
      });
    }

    const result = await checkRegisteredWebsite(id, req.user.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Website checked successfully',
      data: result,
    });
  } catch (error) {
    if (error.message === 'WEBSITE_INACTIVE') {
      return res.status(409).json({
        success: false,
        message: 'This website is inactive',
      });
    }

    console.error('Registered website monitoring error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to monitor registered website',
    });
  }
};

const getWebsiteHistory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid website ID',
      });
    }

    const rawGeneration = req.query.generation;
    let generation;
    if (rawGeneration === 'legacy') {
      generation = 'legacy';
    } else {
      const parsed = parseGeneration(rawGeneration);
      if (!parsed.valid) {
        return res.status(400).json({
          success: false,
          message: 'Generation must be a positive integer or "legacy"',
        });
      }
      generation = parsed.generation;
    }

    const history = await getMonitoringHistory(id, req.user.id, generation);

    if (!history) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    return res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Monitoring history error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve monitoring history',
    });
  }
};

const getWebsiteStats = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUUID(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid website ID',
      });
    }

    const parsed = parseGeneration(req.query.generation);
    if (!parsed.valid) {
      return res.status(400).json({
        success: false,
        message: 'Generation must be a positive integer',
      });
    }

    const stats = await getMonitoringStats(
      id,
      req.user.id,
      parsed.generation
    );

    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Website or URL generation not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Monitoring statistics error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve monitoring statistics',
    });
  }
};

module.exports = {
  monitorWebsite,
  monitorRegisteredWebsite,
  getWebsiteHistory,
  getWebsiteStats,
};
