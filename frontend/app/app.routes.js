(function () {
  'use strict';

  var ADMIN_ANY = ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'REVIEWER', 'MODERATOR', 'FINANCE_OFFICER'];
  var MGR_ROLES = ['SUPER_ADMIN', 'COMPETITION_MANAGER'];
  var FIN_ROLES = ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'FINANCE_OFFICER'];

  angular.module('talentHuntApp')
    .config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
      $locationProvider.html5Mode({ enabled: true, requireBase: true });

      $routeProvider
        // Public routes (Section 7.1)
        .when('/', { templateUrl: 'public/home.html', controller: 'HomeController', controllerAs: 'vm' })
        .when('/competitions', { templateUrl: 'public/competitions.html', controller: 'CompetitionsListController', controllerAs: 'vm' })
        .when('/competitions/:slug', { templateUrl: 'public/competition-detail.html', controller: 'CompetitionDetailController', controllerAs: 'vm' })
        .when('/nominees', { templateUrl: 'public/nominees.html', controller: 'NomineesDirectoryController', controllerAs: 'vm' })
        .when('/nominee/:slug', { templateUrl: 'public/nominee-profile.html', controller: 'NomineeProfileController', controllerAs: 'vm' })
        .when('/vote/:competition/:nominee', { templateUrl: 'public/voting.html', controller: 'VotingPageController', controllerAs: 'vm' })
        .when('/checkout/sandbox/:providerRef', { templateUrl: 'public/sandbox-checkout.html', controller: 'SandboxCheckoutController', controllerAs: 'vm' })
        .when('/orders/:reference', { templateUrl: 'public/order-receipt.html', controller: 'OrderReceiptController', controllerAs: 'vm' })
        .when('/results', { templateUrl: 'public/results.html', controller: 'ResultsController', controllerAs: 'vm' })
        .when('/results/:competition', { templateUrl: 'public/results.html', controller: 'ResultsController', controllerAs: 'vm' })
        .when('/results/:competition/:round', { templateUrl: 'public/results.html', controller: 'ResultsController', controllerAs: 'vm' })
        .when('/how-it-works', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })
        .when('/rules', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })
        .when('/faq', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })
        .when('/contact', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })
        .when('/privacy', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })
        .when('/terms', { templateUrl: 'public/info.html', controller: 'InfoPagesController', controllerAs: 'vm' })

        // Applicant & Nominee Portal (Section 7.2)
        .when('/portal/login', { templateUrl: 'portal/login.html', controller: 'PortalLoginController', controllerAs: 'vm' })
        .when('/portal/register', { templateUrl: 'portal/register.html', controller: 'PortalRegisterController', controllerAs: 'vm' })
        .when('/portal/forgot-password', { templateUrl: 'portal/forgot-password.html', controller: 'PortalForgotPasswordController', controllerAs: 'vm' })
        .when('/portal/dashboard', { templateUrl: 'portal/dashboard.html', controller: 'PortalDashboardController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/submissions', { templateUrl: 'portal/submissions.html', controller: 'PortalSubmissionsListController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/submissions/new', { templateUrl: 'portal/submission-new.html', controller: 'PortalSubmissionNewController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/submissions/:id', { templateUrl: 'portal/submission-detail.html', controller: 'PortalSubmissionDetailController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/profile', { templateUrl: 'portal/profile.html', controller: 'PortalProfileController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/voting', { templateUrl: 'portal/voting-dashboard.html', controller: 'NomineeVotingDashboardController', controllerAs: 'vm', requireAuth: true, requireRoles: ['NOMINEE'] })
        .when('/portal/notifications', { templateUrl: 'portal/notifications.html', controller: 'PortalNotificationsController', controllerAs: 'vm', requireAuth: true })
        .when('/portal/security', { templateUrl: 'portal/security.html', controller: 'PortalSecurityController', controllerAs: 'vm', requireAuth: true })

        // Admin Portal (Section 7.3)
        .when('/admin', { templateUrl: 'admin/dashboard.html', controller: 'AdminDashboardController', controllerAs: 'vm', requireAuth: true, requireRoles: ADMIN_ANY })
        .when('/admin/competitions', { templateUrl: 'admin/competitions.html', controller: 'AdminCompetitionsController', controllerAs: 'vm', requireAuth: true, requireRoles: MGR_ROLES })
        .when('/admin/categories', { templateUrl: 'admin/categories.html', controller: 'AdminCategoriesController', controllerAs: 'vm', requireAuth: true, requireRoles: MGR_ROLES })
        .when('/admin/rounds', { templateUrl: 'admin/rounds.html', controller: 'AdminRoundsController', controllerAs: 'vm', requireAuth: true, requireRoles: MGR_ROLES })
        .when('/admin/submissions', { templateUrl: 'admin/submissions.html', controller: 'AdminSubmissionsController', controllerAs: 'vm', requireAuth: true, requireRoles: ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'REVIEWER', 'MODERATOR'] })
        .when('/admin/nominees', { templateUrl: 'admin/nominees.html', controller: 'AdminNomineesController', controllerAs: 'vm', requireAuth: true, requireRoles: ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'MODERATOR', 'FINANCE_OFFICER'] })
        .when('/admin/votes', { templateUrl: 'admin/votes.html', controller: 'AdminVotesController', controllerAs: 'vm', requireAuth: true, requireRoles: FIN_ROLES })
        .when('/admin/orders', { templateUrl: 'admin/orders.html', controller: 'AdminOrdersController', controllerAs: 'vm', requireAuth: true, requireRoles: FIN_ROLES })
        .when('/admin/reconciliation', { templateUrl: 'admin/reconciliation.html', controller: 'AdminReconciliationController', controllerAs: 'vm', requireAuth: true, requireRoles: FIN_ROLES })
        .when('/admin/eliminations', { templateUrl: 'admin/eliminations.html', controller: 'AdminEliminationsController', controllerAs: 'vm', requireAuth: true, requireRoles: MGR_ROLES })
        .when('/admin/users', { templateUrl: 'admin/users.html', controller: 'AdminUsersController', controllerAs: 'vm', requireAuth: true, requireRoles: ['SUPER_ADMIN'] })
        .when('/admin/moderation', { templateUrl: 'admin/moderation.html', controller: 'AdminModerationController', controllerAs: 'vm', requireAuth: true, requireRoles: ['SUPER_ADMIN', 'COMPETITION_MANAGER', 'MODERATOR', 'FINANCE_OFFICER'] })
        .when('/admin/reports', { templateUrl: 'admin/reports.html', controller: 'AdminReportsController', controllerAs: 'vm', requireAuth: true, requireRoles: FIN_ROLES })
        .when('/admin/audit-logs', { templateUrl: 'admin/audit-logs.html', controller: 'AdminAuditLogsController', controllerAs: 'vm', requireAuth: true, requireRoles: FIN_ROLES })
        .when('/admin/settings', { templateUrl: 'admin/settings.html', controller: 'AdminSettingsController', controllerAs: 'vm', requireAuth: true, requireRoles: MGR_ROLES })
        .otherwise({ redirectTo: '/' });
    }]);
})();
