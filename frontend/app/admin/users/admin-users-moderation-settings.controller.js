(function () {
  'use strict';

  angular.module('talentHuntApp')
    .controller('AdminUsersController', ['ApiService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.users = [];
        vm.availableRoles = [];
        vm.meta = {};
        vm.editingUser = null;
        vm.roleChecks = {};
        vm.filters = {
          q: '',
          role: '',
          status: '',
          is_verified: ''
        };

        vm.activeFilterCount = function () {
          return AdminFilterUtils.countActive(vm.filters);
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', role: '', status: '', is_verified: '' };
          vm.load(1);
        };

        vm.load = function (page) {
          var params = AdminFilterUtils.cleanParams(vm.filters);
          params.page = page || 1;
          ApiService.get('/admin/users', params).then(function (res) {
            vm.users = res.data || [];
            vm.meta = res.meta || {};
            if (res.meta && res.meta.available_roles && res.meta.available_roles.length) {
              vm.availableRoles = res.meta.available_roles;
            }
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
      }
    ])
    .controller('AdminModerationController', ['ApiService', 'PermissionsService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, PermissionsService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.perms = PermissionsService;
        vm.reports = [];
        vm.tickets = [];
        vm.modFilters = { q: '', entity_type: '', status: '' };
        vm.ticketFilters = { q: '', category: '', status: '' };

        vm.loadModeration = function () {
          if (!vm.perms.canModerate()) return;
          ApiService.get('/admin/moderation', AdminFilterUtils.cleanParams(vm.modFilters)).then(function (res) {
            vm.reports = res.data || [];
          });
        };

        vm.loadTickets = function () {
          ApiService.get('/admin/support-tickets', AdminFilterUtils.cleanParams(vm.ticketFilters)).then(function (res) {
            vm.tickets = res.data || [];
          });
        };

        vm.load = function () {
          vm.loadModeration();
          vm.loadTickets();
        };

        vm.activeModFilterCount = function () {
          return AdminFilterUtils.countActive(vm.modFilters);
        };

        vm.resetModFilters = function () {
          vm.modFilters = { q: '', entity_type: '', status: '' };
          vm.loadModeration();
        };

        vm.activeTicketFilterCount = function () {
          return AdminFilterUtils.countActive(vm.ticketFilters);
        };

        vm.resetTicketFilters = function () {
          vm.ticketFilters = { q: '', category: '', status: '' };
          vm.loadTickets();
        };

        vm.resolveReport = function (r, st) {
          var notes = window.prompt('Enter moderation resolution notes:', r.resolution_notes || 'Reviewed by moderation');
          if (notes === null) return;
          ApiService.patch('/admin/moderation/' + r.id, { status: st, resolution_notes: notes }).then(function () {
            ToastService.success('Moderation case updated.');
            vm.loadModeration();
          });
        };

        vm.resolveTicket = function (t, st) {
          var notes = window.prompt('Enter support resolution notes:', t.resolution_notes || 'Resolved with customer');
          if (notes === null) return;
          ApiService.patch('/admin/support-tickets/' + t.id, { status: st, resolution_notes: notes }).then(function () {
            ToastService.success('Support ticket updated.');
            vm.loadTickets();
          });
        };

        vm.load();
      }
    ])
    .controller('AdminSettingsController', ['ApiService', 'ToastService', 'AdminFilterUtils',
      function (ApiService, ToastService, AdminFilterUtils) {
        var vm = this;
        vm.announcements = [];
        vm.newAnn = { title: '', date: '2026-11-16', summary: '' };
        vm.filters = { q: '', sort: 'newest' };

        ApiService.get('/admin/settings').then(function (res) {
          var ann = (res.data && res.data.announcements && res.data.announcements.items) || [];
          vm.announcements = ann;
        });

        vm.activeFilterCount = function () {
          var c = AdminFilterUtils.countActive(vm.filters, ['sort']);
          if (vm.filters.sort && vm.filters.sort !== 'newest') c++;
          return c;
        };

        vm.resetFilters = function () {
          vm.filters = { q: '', sort: 'newest' };
        };

        vm.filteredAnnouncements = function () {
          var q = (vm.filters.q || '').trim().toLowerCase();
          var list = (vm.announcements || []).filter(function (a) {
            if (!q) return true;
            var hay = ((a.title || '') + ' ' + (a.summary || '') + ' ' + (a.date || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
          });
          if (vm.filters.sort === 'oldest') {
            list = list.slice().reverse();
          }
          return list;
        };

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
      }
    ])
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
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Users &amp; Role-Based Access Control</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.load(vm.meta.page || 1)"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Accounts</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.meta.total !== undefined ? vm.meta.total : vm.users.length }} user(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Users</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.load(1)" placeholder="Name, email, phone, location..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">RBAC Role</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.role" ng-change="vm.load(1)">',
        '              <option value="">All Roles</option>',
        '              <option ng-repeat="r in vm.availableRoles" value="{{ r }}">{{ r }}</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Account Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.status" ng-change="vm.load(1)">',
        '              <option value="">All Statuses</option>',
        '              <option value="ACTIVE">ACTIVE</option>',
        '              <option value="SUSPENDED">SUSPENDED</option>',
        '              <option value="DEACTIVATED">DEACTIVATED</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Contact Verification</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.filters.is_verified" ng-change="vm.load(1)">',
        '              <option value="">All</option>',
        '              <option value="true">Verified</option>',
        '              <option value="false">Unverified</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="!vm.users.length" class="empty-state">No user accounts match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.users.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Name</th><th>Contact</th><th>Roles</th><th>Status</th><th>Actions</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="u in vm.users">',
        '              <td><strong>{{ u.full_name }}</strong><div class="muted" style="font-size:0.76rem;" ng-if="u.location">{{ u.location }}</div></td>',
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
        '    <div class="card mb-3" ng-if="vm.perms.canModerate()">',
        '      <div class="flex-between mb-2">',
        '        <h1 style="margin:0;font-size:1.5rem;">Moderation &amp; Fraud Review Queue</h1>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadModeration()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Moderation Cases</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.reports.length }} case(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeModFilterCount() > 0" ng-click="vm.resetModFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Cases</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.modFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadModeration()" placeholder="Reason, details, entity ID..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Entity Type</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.modFilters.entity_type" ng-change="vm.loadModeration()">',
        '              <option value="">All Types</option>',
        '              <option value="SUBMISSION">SUBMISSION</option>',
        '              <option value="NOMINEE">NOMINEE</option>',
        '              <option value="VOTING_ANOMALY">VOTING_ANOMALY</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.modFilters.status" ng-change="vm.loadModeration()">',
        '              <option value="">All Statuses</option>',
        '              <option value="OPEN">OPEN</option>',
        '              <option value="INVESTIGATING">INVESTIGATING</option>',
        '              <option value="ACTIONED">ACTIONED</option>',
        '              <option value="DISMISSED">DISMISSED</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="!vm.reports.length" class="empty-state">No moderation or anomaly cases match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.reports.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Type</th><th>Reason</th><th>Details</th><th>Status</th><th>Action</th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="r in vm.reports">',
        '              <td>{{ r.entity_type }}</td><td><strong>{{ r.reason }}</strong></td><td>{{ r.details }}</td>',
        '              <td><th-status-badge status="r.status"></th-status-badge></td>',
        '              <td class="inline-actions"><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveReport(r, \'ACTIONED\')">Action</button><button type="button" class="btn btn-sm btn-secondary" ng-click="vm.resolveReport(r, \'DISMISSED\')">Dismiss</button></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',

        '    <div class="card">',
        '      <div class="flex-between mb-2">',
        '        <h2 style="margin:0;font-size:1.3rem;">Support Tickets</h2>',
        '        <button type="button" class="btn btn-sm btn-secondary" ng-click="vm.loadTickets()"><th-icon name="refresh" size="14"></th-icon><span>Refresh</span></button>',
        '      </div>',

        '      <div class="filter-bar">',
        '        <div class="filter-bar-top">',
        '          <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Support Tickets</span></span>',
        '          <div class="inline-actions">',
        '            <span class="filter-count-pill">{{ vm.tickets.length }} ticket(s)</span>',
        '            <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeTicketFilterCount() > 0" ng-click="vm.resetTicketFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '          </div>',
        '        </div>',
        '        <div class="filter-bar-grid">',
        '          <div class="filter-field-search">',
        '            <label class="filter-label">Search Tickets</label>',
        '            <div class="search-input-wrap">',
        '              <th-icon name="search" size="15"></th-icon>',
        '              <input type="text" class="form-control form-control-sm" ng-model="vm.ticketFilters.q" ng-model-options="{ debounce: 250 }" ng-change="vm.loadTickets()" placeholder="Ticket ref, subject, contact, order ref..." />',
        '            </div>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Category</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.ticketFilters.category" ng-change="vm.loadTickets()">',
        '              <option value="">All Categories</option>',
        '              <option value="PAYMENT">PAYMENT</option>',
        '              <option value="VOTING">VOTING</option>',
        '              <option value="APPLICATION">APPLICATION</option>',
        '              <option value="GENERAL">GENERAL</option>',
        '            </select>',
        '          </div>',
        '          <div class="filter-field">',
        '            <label class="filter-label">Status</label>',
        '            <select class="form-control form-control-sm" ng-model="vm.ticketFilters.status" ng-change="vm.loadTickets()">',
        '              <option value="">All Statuses</option>',
        '              <option value="OPEN">OPEN</option>',
        '              <option value="IN_PROGRESS">IN_PROGRESS</option>',
        '              <option value="RESOLVED">RESOLVED</option>',
        '              <option value="CLOSED">CLOSED</option>',
        '            </select>',
        '          </div>',
        '        </div>',
        '      </div>',

        '      <div ng-if="!vm.tickets.length" class="empty-state">No support tickets match the selected filters.</div>',
        '      <div class="table-responsive" ng-if="vm.tickets.length">',
        '        <table class="data-table">',
        '          <thead><tr><th>Ref</th><th>Category</th><th>Contact</th><th>Subject</th><th>Status</th><th></th></tr></thead>',
        '          <tbody>',
        '            <tr ng-repeat="t in vm.tickets">',
        '              <td><code>{{ t.ticket_reference }}</code></td><td>{{ t.category }}</td><td>{{ t.contact_name }} ({{ t.contact_phone || t.contact_email }})</td><td>{{ t.subject }}</td>',
        '              <td><th-status-badge status="t.status"></th-status-badge></td>',
        '              <td><button type="button" class="btn btn-sm btn-primary" ng-click="vm.resolveTicket(t, \'RESOLVED\')">Resolve</button></td>',
        '            </tr>',
        '          </tbody>',
        '        </table>',
        '      </div>',
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
        '      <button type="submit" class="btn btn-primary"><th-icon name="plus" size="15"></th-icon><span>Publish Announcement</span></button>',
        '    </form>',

        '    <div class="filter-bar">',
        '      <div class="filter-bar-top">',
        '        <span class="filter-bar-title"><th-icon name="filter" size="14"></th-icon><span>Filter Published Announcements</span></span>',
        '        <div class="inline-actions">',
        '          <span class="filter-count-pill">{{ vm.filteredAnnouncements().length }} of {{ vm.announcements.length }}</span>',
        '          <button type="button" class="btn btn-sm btn-secondary" ng-if="vm.activeFilterCount() > 0" ng-click="vm.resetFilters()"><th-icon name="rotate-ccw" size="14"></th-icon><span>Reset</span></button>',
        '        </div>',
        '      </div>',
        '      <div class="filter-bar-grid">',
        '        <div class="filter-field-search">',
        '          <label class="filter-label">Search Announcements</label>',
        '          <div class="search-input-wrap">',
        '            <th-icon name="search" size="15"></th-icon>',
        '            <input type="text" class="form-control form-control-sm" ng-model="vm.filters.q" placeholder="Search announcement title, summary, or date..." />',
        '          </div>',
        '        </div>',
        '        <div class="filter-field">',
        '          <label class="filter-label">Sort Order</label>',
        '          <select class="form-control form-control-sm" ng-model="vm.filters.sort">',
        '            <option value="newest">Newest First</option>',
        '            <option value="oldest">Oldest First</option>',
        '          </select>',
        '        </div>',
        '      </div>',
        '    </div>',

        '    <div ng-if="!vm.filteredAnnouncements().length" class="empty-state">No announcements match your search filter.</div>',
        '    <div ng-repeat="a in vm.filteredAnnouncements()" style="padding:10px 0;border-bottom:1px solid var(--border);">',
        '      <strong>{{ a.title }}</strong> <span class="muted">({{ a.date }})</span><p class="muted" style="margin:4px 0 0;">{{ a.summary }}</p>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join(''));
    }]);
})();
