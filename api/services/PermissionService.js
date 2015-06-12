var methodMap = {
  POST: 'create',
  GET: 'read',
  PUT: 'update',
  DELETE: 'delete'
};

var findRecords = require('sails/lib/hooks/blueprints/actions/find');
var wlFilter = require('waterline-criteria');

module.exports = {

  /**
   * Given an object, or a list of objects, return true if the list contains
   * objects not owned by the specified user.
   */
  hasForeignObjects: function (objects, user) {
    if (!_.isArray(objects)) {
      return PermissionService.isForeignObject(user.id)(objects);
    }
    return _.any(objects, PermissionService.isForeignObject(user.id));
  },

  /**
   * Return whether the specified object is NOT owned by the specified user.
   */
  isForeignObject: function (owner) {
    return function (object) {
      //sails.log('object', object);
      //sails.log('object.owner: ', object.owner, ', owner:', owner);
      return object.owner !== owner;
    };
  },

  /**
   * Find objects that some arbitrary action would be performed on, given the
   * same request.
   *
   * @param options.model
   * @param options.query
   *
   * TODO this will be less expensive when waterline supports a caching layer
   */
  findTargetObjects: function (req) {
    return new Promise(function (resolve, reject) {
      findRecords(req, {
        ok: resolve,
        serverError: reject
      });
    });
  },

  /**
   * Query Permissions that grant privileges to a role/user on an action for a
   * model.
   *
   * @param options.method
   * @param options.model
   * @param options.user
   */
  findModelPermissions: function (options) {
    var action = PermissionService.getMethod(options.method);
    var permissionCriteria = {
      model: options.model.id,
      action: action
    };

    return User.findOne(options.user.id)
      .populate('roles')
      .then(function (user) {
        return Permission.find({
          model: options.model.id,
          action: action,
          role: _.pluck(user.roles, 'id')
        });
      });
  },

  /**
   * given a list of objects, determine if they all satisfy at least on permission where clause
   */
  checkWhereClause: function (objects, permissions, attributes) {
                        /*
    var criteria = _.compact(req.permissions.map(function(permission) {
      return permission.where;
    }));
    */

    // return success if there are no permissions or objects
    if (_.isEmpty(permissions) || _.isEmpty(objects)) return true;

    if (!_.isArray(objects)) {
        objects = [objects];
    }

    if (!_.isArray(permissions)) {
        permission = [permissions];
    }

    // every object must have at least one permission that has a passing criteria
    return objects.every(function (obj) {
        return permissions.some(function (permission) {
            var criteria = permission.where;
            var whitelist = permission.attributes;
            var match = wlFilter([obj], { where: criteria }).results;
            var hasUnpermittedAttributes = PermissionService.hasUnpermittedAttributes(attributes, whitelist);
            return match.length === 1 && !hasUnpermittedAttributes;
        });
    });

  },

  hasUnpermittedAttributes: function (attributes, whitelist) {
    if (_.isEmpty(attributes) || _.isEmpty(whitelist)) {
        return false;
    }
    return _.difference(Object.keys(attributes), whitelist).length ? true : false;
  },

  /**
   * Return true if the specified model supports the ownership policy; false
   * otherwise.
   */
  hasOwnershipPolicy: function (model) {
    return model.autoCreatedBy;
  },

  /**
   * Build an error message
   */
  getErrorMessage: function (options) {
    return [
      'User', options.user.email, 'is not permitted to', options.method, options.model.globalId
    ].join(' ');
  },

  /**
   * Given an action, return the CRUD method it maps to.
   */
  getMethod: function (method) {
    return methodMap[method];
  }
};
