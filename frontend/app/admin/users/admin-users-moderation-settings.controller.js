(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminUsersController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.users = [];
      vm.availableRoles = [];
      vm.meta = {};
      vm.editingUser = null;
      vm.roleChecks = {};

      vm.load = function (page) {
        ApiService.get('/admin/users', { page: page || 1 }).then(function (res) {
          vm.users = res.data || [];
          vm.meta = res.meta || {};
          vm.availableRoles = (res.meta && res.meta.available_roles) || [];
        });
      };

      vm.openRoleEditor = function (u) {
        vm.editingUser = u;
        vm.roleChecks = {};
        for (var i = 0; i < u.roles.length; i++) {
          vm.roleChecks[u.roles[i]] = true;
        }
      };

      vm.saveRoles = function () {
        var selected = [];
        angular.forEach(vm.roleChecks, function (val, key) {
          if (val) selected.push(key);
        });
        ApiService.patch('/admin/users/' + vm.editingUser.id + '/roles', { roles: selected }).then(function () {
          ToastService.success('Roles updated for ' + vm.editingUser.full_name);
          vm.editingUser = null;
          vm.load(vm.meta.page);
        }, function (err) { ToastService.error(err.message); });
      };

      vm.toggleStatus = function (u) {
        var next = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        ApiService.patch('/admin/users/' + u.id + '/status', { status: next }).then(function () {
          ToastService.success('Account status changed to ' + next);
          vm.load(vm.meta.page);
        }, function (err) { ToastService.error(err.message); });
      };

      vm.load(1);
    }])
    .controller('AdminModerationController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.reports = [];
      vm.tickets = [];

      vm.load = function () {
        ApiService.get('/admin/moderation').then(function (res) { vm.reports = res.data || []; });
        ApiService.get('/admin/support-tickets').then(function (res) { vm.tickets = res.data || []; });
      };

      vm.resolveReport = function (r, st) {
        var notes = window.prompt('Enter moderation resolution notes:', r.resolution_notes || 'Reviewed by moderation');
        if (notes === null) return;
        ApiService.patch('/admin/moderation/' + r.id, { status: st, resolution_notes: notes }).then(function () {
          ToastService.success('Moderation case updated.');
          vm.load();
        });
      };

      vm.resolveTicket = function (t, st) {
        var notes = window.prompt('Enter support resolution notes:', t.resolution_notes || 'Resolved with customer');
        if (notes === null) return;
        ApiService.patch('/admin/support-tickets/' + t.id, { status: st, resolution_notes: notes }).then(function () {
          ToastService.success('Support ticket updated.');
          vm.load();
        });
      };

      vm.load();
    }])
    .controller('AdminSettingsController', ['ApiService', 'ToastService', function (ApiService, ToastService) {
      var vm = this;
      vm.announcements = [];
      vm.newAnn = { title: '', date: '2026-11-16', summary: '' };

      ApiService.get('/admin/settings').then(function (res) {
        var ann = (res.data && res.data.announcements && res.data.announcements.items) || [];
        vm.announcements = ann;
      });

      vm.addAnnouncement = function () {
        vm.announcements.unshift({
          id: 'ann-' + Date.now(),
          title: vm.newAnn.title,
          date: vm.newAnn.date,
          summary: vm.newAnn.summary
        });
        ApiService.patch('/admin/settings', { announcements: { items: vm.announcements } }).then(function () {
          vm.newAnn = { title: '', date: '2026-11-16', summary: '' };
          ToastService.success('Announcement published.');
        });
      };
    }])
    .run(['$templateCache', function ($templateCache) {
      $templateCache.put('admin/users.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3" ng-if="vm.editingUser">',
        '      <h3>Manage RBAC Roles: {{ vm.editingUser.full_name }}</h3>',
        '      <div class="inline-actions mb-2">',
        '        <label ng-repeat="role in vm.availableRoles" style="margin-right:12px;"><input type="checkbox" ng-model="vm.roleChecks[role]" /> {{ role }}</label>',
        '      </div>',
        '      <div class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.saveRoles()">Save Roles</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.editingUser = null">Cancel</button></div>',
        '    </div>',
        '    <div class="card">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Users &amp; Role-Based Access Control</h1>',
        '      <div class="table-responsive">',
        '        <table class="data-table">',
        '          <thead><tr><th>Name</th><th>Contact</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="u in vm.users">',
        '              <td><strong>{{ u.full_name }}</strong></td>',
        '              <td>{{ u.email || u.phone }}</td>',
        '              <td><code>{{ u.roles.join(", ") }}</code></td>',
        '              <td><th-status-badge status="u.status"></th-status-badge></td>',
        '              <td class="inline-actions">',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.openRoleEditor(u)">Edit Roles</button>',
        '                <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.toggleStatus(u)">{{ u.status === "ACTIVE" ? "Suspend" : "Activate" }}</button>',
        '              </td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '      <th-pagination meta="vm.meta" on-page="vm.load(page)"></th-pagination>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/moderation.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div>',
        '    <div class="card mb-3">',
        '      <h1 style="margin-top:0;font-size:1.5rem;">Moderation &amp; Fraud Review Queue</h1>',
        '      <div ng-if="!vm.reports.length" class="muted">No moderation or anomaly cases open.</div>',
        '      <table class="data-table" ng-if="vm.reports.length">',
        '        <thead><tr><th>Type</th><th>Reason</th><th>Details</th><th>Status</th><th>Action</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="r in vm.reports">',
        '            <td>{{ r.entity_type }}</td><td><strong>{{ r.reason }}</strong></td><td>{{ r.details }}</td>',
        '            <td><th-status-badge status="r.status"></th-status-badge></td>',
        '            <td class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveReport(r, \'ACTIONED\')">Action</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.resolveReport(r, \'DISMISSED\')">Dismiss</button></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '    <div class="card">',
        '      <h2 style="margin-top:0;font-size:1.3rem;">Support Tickets</h2>',
        '      <div ng-if="!vm.tickets.length" class="muted">No support tickets submitted yet.</div>',
        '      <table class="data-table" ng-if="vm.tickets.length">',
        '        <thead><tr><th>Ref</th><th>Category</th><th>Contact</th><th>Subject</th><th>Status</th><th></th></tr></thead>',
        '        <tbody>',
        '          <tr ng-repeat="t in vm.tickets">',
        '            <td><code>{{ t.ticket_reference }}</code></td><td>{{ t.category }}</td><td>{{ t.contact_name }} ({{ t.contact_phone || t.contact_email }})</td><td>{{ t.subject }}</td>',
        '            <td><th-status-badge status="t.status"></th-status-badge></td>',
        '            <td><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveTicket(t, \'RESOLVED\')">Resolve</button></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));

      $templateCache.put('admin/settings.html', [
        '<div class="container portal-layout">',
        '  <th-admin-nav></th-admin-nav>',
        '  <div class="card">',
        '    <h1 style="margin-top:0;font-size:1.5rem;">Platform Announcements &amp; Settings</h1>',
        '    <form class="mb-3" ng-submit="vm.addAnnouncement()">',
        '      <div class="grid-2">',
        '        <div class="form-group"><label class="form-label">Announcement Title *</label><input type="text" class="form-control" ng-model="vm.newAnn.title" required /></div>',
        '        <div class="form-group"><label class="form-label">Date</label><input type="text" class="form-control" ng-model="vm.newAnn.date" /></div>',
        '      </div>',
        '      <div class="form-group"><label class="form-label">Summary *</label><textarea class="form-control" ng-model="vm.newAnn.summary" required></textarea></div>',
        '      <button type="submit" class="btn btn-primary">Publish Announcement</button>',
        '    </form>',
        '    <div ng-repeat="a in vm.announcements" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '      <strong>{{ a.title }}</strong> <span class="muted">({{ a.date }})</span><p class="muted" style="margin:4px 0 0;">{{ a.summary }}</p>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
