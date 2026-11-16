(function () {
  'use strict';

  angular.module('talentHuntApp')
    .factory('PermissionsService', ['AuthService', function (AuthService) {
      function userRoles() {
        var u = AuthService.state.user;
        return (u && u.roles) ? u.roles : [];
      }

      function hasAnyRole(allowed) {
        var roles = userRoles();
        if (roles.indexOf('SUPER_ADMIN') !== -1) return true;
        for (var i = 0; i < allowed.length; i++) {
          if (roles.indexOf(allowed[i]) !== -1) return true;
        }
        return false;
      }

      return {
        userRoles: userRoles,
        hasAnyRole: hasAnyRole,
        isNominee: function () { return userRoles().indexOf('NOMINEE') !== -1; },
        canAccessAdmin: function () {
          return hasAnyRole(['SUPER_ADMIN', 'COMPETITION_MANAGER', 'REVIEWER', 'MODERATOR', 'FINANCE_OFFICER']);
        },
        canManageCompetition: function () {
          return hasAnyRole(['SUPER_ADMIN', 'COMPETITION_MANAGER']);
        },
        canReview: function () {
          return hasAnyRole(['SUPER_ADMIN', 'COMPETITION_MANAGER', 'REVIEWER']);
        },
        canModerate: function () {
          return hasAnyRole(['SUPER_ADMIN', 'COMPETITION_MANAGER', 'MODERATOR']);
        },
        canFinance: function () {
          return hasAnyRole(['SUPER_ADMIN', 'COMPETITION_MANAGER', 'FINANCE_OFFICER']);
        },
        canRefund: function () {
          return hasAnyRole(['SUPER_ADMIN', 'FINANCE_OFFICER']);
        },
        isSuperAdmin: function () {
          return userRoles().indexOf('SUPER_ADMIN') !== -1;
        }
      };
    }]);
})();
