const {
  createWebsite,
  deleteWebsite,
  getWebsites,
  updateWebsite: updateWebsiteRecord,
} = require('../services/website.service');
const { WebsiteUrlError, validateWebsiteUrl } = require('../services/url-security.service');
const { isValidUUID } = require('../utils/validation');

const validateWebsiteFields = (name, url) => {
  if (
    name !== undefined &&
    name !== null &&
    (typeof name !== 'string' || name.trim().length > 100)
  ) {
    return 'Website name must be 100 characters or fewer';
  }

  if (typeof url !== 'string' || !url.trim()) {
    return 'Website URL is required';
  }

  return null;
};

const safeUrlValidationMessage = (error) =>
  error instanceof WebsiteUrlError
    ? error.message
    : 'Website hostname could not be resolved';

const registerWebsite = async (req, res) => {
  try {
    const { name, url } = req.body || {};
    const validationMessage = validateWebsiteFields(name, url);

    if (validationMessage) {
      return res.status(400).json({
        success: false,
        message: validationMessage,
      });
    }

    let normalizedUrl;
    try {
      normalizedUrl = await validateWebsiteUrl(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: safeUrlValidationMessage(error),
      });
    }

    const website = await createWebsite(
      req.user.id,
      typeof name === 'string' && name.trim() ? name.trim() : null,
      normalizedUrl
    );

    return res.status(201).json({
      success: true,
      message: 'Website registered successfully',
      data: website,
    });
  } catch (error) {
    console.error('Website registration error:', error.code || 'unknown error');

    return res.status(500).json({
      success: false,
      message: 'Failed to register website',
    });
  }
};

const updateWebsite = async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid website ID',
    });
  }

  try {
    const { name, url } = req.body || {};
    const validationMessage = validateWebsiteFields(name, url);

    if (validationMessage) {
      return res.status(400).json({
        success: false,
        message: validationMessage,
      });
    }

    let normalizedUrl;
    try {
      normalizedUrl = await validateWebsiteUrl(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: safeUrlValidationMessage(error),
      });
    }

    const website = await updateWebsiteRecord(
      req.user.id,
      id,
      typeof name === 'string' && name.trim() ? name.trim() : null,
      normalizedUrl
    );

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Website updated successfully',
      data: website,
    });
  } catch (error) {
    console.error('Website update error:', error.code || 'unknown error');
    return res.status(500).json({
      success: false,
      message: 'Failed to update website',
    });
  }
};

const removeWebsite = async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid website ID',
    });
  }

  try {
    const website = await deleteWebsite(req.user.id, id);

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Website and its monitoring history were deleted',
      data: website,
    });
  } catch (error) {
    console.error('Website deletion error:', error.code || 'unknown error');
    return res.status(500).json({
      success: false,
      message: 'Failed to delete website',
    });
  }
};

const listWebsites = async (req, res) => {
  try {
    const websites = await getWebsites(req.user.id);

    return res.status(200).json({
      success: true,
      count: websites.length,
      data: websites,
    });
  } catch (error) {
    console.error('Website retrieval error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve websites',
    });
  }
};

module.exports = {
  registerWebsite,
  listWebsites,
  updateWebsite,
  removeWebsite,
};
