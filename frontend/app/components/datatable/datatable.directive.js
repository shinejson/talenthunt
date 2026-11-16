(function () {
  'use strict';

  /**
   * th-datatable — DataTables (datatables.net) wrapper for AngularJS tables.
   *
   * DataTables owns paging, page size, ordering and the "Showing X to Y of Z" summary,
   * while each row is still a normal AngularJS template (ng-click, filters, components...).
   *
   * 1) Server-side processing (DataTables fetches every page from the API):
   *
   *      vm.table = DataTableSource.server('/admin/orders',
   *        function () { return AdminFilterUtils.cleanParams(vm.filters); },   // extra query params
   *        function (res) { vm.meta = res.meta || {}; });                      // optional, after each page
   *
   *      vm.table.load(1)        // refetch from page 1 (filters changed)
   *      vm.table.load()         // refetch but stay on the current page (a row was edited)
   *      vm.table.clearOrder()   // drop any column ordering chosen by the user
   *
   *    DataTableSource.server() is shorthand for { fetch: function (params) { ... } }, where
   *    params = { page, per_page, sort_by, sort_dir } and the promise resolves to
   *    { data: [...], meta: { total } } — the envelope every paginated API endpoint returns.
   *
   *      <table class="data-table" th-datatable="vm.table" dt-row="o" dt-empty="No orders found.">
   *        <thead><tr><th dt-sort="public_reference">Order Ref</th><th>Nominee</th></tr></thead>
   *        <tbody><tr><td>{{ o.public_reference }}</td><td>{{ o.nominee_name }}</td></tr></tbody>
   *      </table>
   *
   * 2) Client-side processing (the array is already loaded, DataTables pages it locally):
   *
   *      <table class="data-table" th-datatable dt-data="vm.categories" dt-row="cat">
   *        <thead><tr><th dt-sort="cat.name">Name</th><th>Status</th></tr></thead>
   *        <tbody><tr><td>{{ cat.name }}</td><td>{{ cat.status }}</td></tr></tbody>
   *      </table>
   *
   * 3) Dynamic columns (plain text cells, no row template):
   *
   *      <table class="data-table" th-datatable dt-data="vm.report.rows" dt-columns="vm.report.columns"></table>
   *
   * Table attributes : dt-row (row alias, default "row"), dt-empty, dt-page-length,
   *                    dt-length-menu, dt-search-box (show the DataTables search input).
   * Header attributes: dt-sort makes a column orderable. Server-side its value is the key sent
   *                    as sort_by; client-side it is an expression using the row alias, exactly
   *                    as in the row template (e.g. "cat.name").
   *                    dt-filter="expr" overrides the text used by the client-side search box.
   */
  var DEFAULT_LENGTH_MENU = [10, 25, 50, 100];
  var DEFAULT_PAGE_LENGTH = 25;
  var LOAD_ERROR_TEXT = 'Unable to load records. Please try again.';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readAttributes(node) {
    var out = [];
    for (var i = 0; i < node.attributes.length; i++) {
      out.push({ name: node.attributes[i].name, value: node.attributes[i].value });
    }
    return out;
  }

  function applyAttributes(node, attributes) {
    for (var i = 0; i < attributes.length; i++) {
      var attr = attributes[i];
      if (attr.name === 'class') {
        // Merge instead of overwrite so classes added by DataTables survive.
        var names = attr.value.split(/\s+/);
        for (var j = 0; j < names.length; j++) {
          if (names[j]) node.classList.add(names[j]);
        }
      } else {
        node.setAttribute(attr.name, attr.value);
      }
    }
  }

  angular.module('talentHuntApp')
    .factory('DataTableSource', ['ApiService', function (ApiService) {
      return {
        server: function (path, getParams, onLoad) {
          var source = {
            fetch: function (params) {
              var query = angular.extend({}, getParams ? getParams() : {}, params);
              return ApiService.get(path, query).then(function (res) {
                if (onLoad) onLoad(res);
                return res;
              });
            },
            // load(1) starts again from the first page; load() refreshes the page being viewed.
            // (reload is attached by the th-datatable directive once the table exists; before
            // that the table's own first draw does the fetching.)
            load: function (page) {
              if (source.reload) source.reload(page === 1);
            },
            clearOrder: angular.noop
          };
          return source;
        }
      };
    }])
    .directive('thDatatable', ['$compile', '$parse', '$q', '$timeout', '$window',
      function ($compile, $parse, $q, $timeout, $window) {
        return {
          restrict: 'A',
          compile: function (tElement) {
            // NB: this is the *template* element. Under ng-if / ng-repeat AngularJS links a clone,
            // so everything below only reads from it; link() works on its own element.
            var templateEl = tElement[0];

            // Lift the first body row out as the row template *before* AngularJS compiles the
            // table's children; it is compiled once per record against its own child scope.
            var rowTemplate = null;
            var tbody = templateEl.tBodies && templateEl.tBodies[0];
            if (tbody && tbody.rows.length) {
              var templateRow = tbody.rows[0];
              rowTemplate = { attributes: readAttributes(templateRow), cells: [] };
              for (var c = 0; c < templateRow.cells.length; c++) {
                rowTemplate.cells.push({
                  attributes: readAttributes(templateRow.cells[c]),
                  html: templateRow.cells[c].innerHTML
                });
              }
              while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
            }

            var columnMeta = [];
            var headRow = templateEl.tHead && templateEl.tHead.rows[0];
            if (headRow) {
              for (var h = 0; h < headRow.cells.length; h++) {
                columnMeta.push({
                  sort: headRow.cells[h].getAttribute('dt-sort') || '',
                  filter: headRow.cells[h].getAttribute('dt-filter') || ''
                });
              }
            }

            return function link(scope, element, attrs) {
              var tableEl = element[0];
              var DataTable = $window.DataTable;
              if (!DataTable) {
                throw new Error('th-datatable requires DataTables (vendor/dataTables.min.js).');
              }

              var config = (attrs.thDatatable && scope.$eval(attrs.thDatatable)) || {};
              var serverSide = angular.isFunction(config.fetch);
              var dynamicColumns = !!attrs.dtColumns;
              var rowAlias = attrs.dtRow || 'row';
              var searchBox = attrs.dtSearchBox !== undefined;
              var emptyText = attrs.dtEmpty || 'No records to display.';

              var pageLength = parseInt(attrs.dtPageLength, 10) || DEFAULT_PAGE_LENGTH;
              var lengthMenu = (attrs.dtLengthMenu && scope.$eval(attrs.dtLengthMenu)) || DEFAULT_LENGTH_MENU;
              lengthMenu = lengthMenu.slice();
              if (lengthMenu.indexOf(pageLength) === -1) {
                lengthMenu.push(pageLength);
                lengthMenu.sort(function (a, b) { return a - b; });
              }
              var smallestLength = lengthMenu[0];

              var table = null;
              var destroyed = false;
              var liveScopes = [];      // scopes of the rows DataTables currently holds
              var createdScopes = [];   // scopes created since the last completed draw
              var loadFailed = false;
              var recovering = false;

              function destroyScopes(list) {
                for (var i = 0; i < list.length; i++) list[i].$destroy();
              }

              function createdRow(row, data, dataIndex, cells) {
                if (!rowTemplate) return;
                var rowScope = scope.$new();
                rowScope[rowAlias] = data;
                applyAttributes(row, rowTemplate.attributes);
                for (var i = 0; i < rowTemplate.cells.length; i++) {
                  if (!cells[i]) continue;
                  applyAttributes(cells[i], rowTemplate.cells[i].attributes);
                  cells[i].innerHTML = rowTemplate.cells[i].html;
                }
                $compile(row)(rowScope);
                createdScopes.push(rowScope);
              }

              function drawCallback(settings) {
                if (destroyed) return;
                if (serverSide) {
                  // Every server-side draw rebuilds all rows, so the previous page's scopes are stale.
                  destroyScopes(liveScopes);
                  liveScopes = createdScopes;
                } else {
                  liveScopes = liveScopes.concat(createdScopes);
                }
                createdScopes = [];

                var api = settings.api;
                var info = api.page.info();
                var container = api.table().container();
                if (container) {
                  // Hide controls that would be noise for short lists.
                  container.classList.toggle('dt-single-page', info.pages <= 1);
                  container.classList.toggle('dt-fits-smallest-page', info.recordsDisplay <= smallestLength);
                }
                if (loadFailed) {
                  var emptyCell = tableEl.querySelector('tbody td.dt-empty');
                  if (emptyCell) emptyCell.textContent = LOAD_ERROR_TEXT;
                }
                // Rows are compiled outside of AngularJS' own flow (e.g. a paging click) — digest them.
                scope.$evalAsync(angular.noop);
              }

              function serverAjax(request, callback) {
                var length = request.length > 0 ? request.length : pageLength;
                var params = { page: Math.floor(request.start / length) + 1, per_page: length };
                var order = request.order && request.order[0];
                if (order && columnMeta[order.column] && columnMeta[order.column].sort) {
                  params.sort_by = columnMeta[order.column].sort;
                  params.sort_dir = order.dir === 'desc' ? 'desc' : 'asc';
                }
                if (searchBox && request.search && request.search.value) {
                  params.q = request.search.value;
                }

                scope.$evalAsync(function () {
                  if (destroyed) return;
                  $q.when(config.fetch(params)).then(function (res) {
                    if (destroyed) return;
                    var rows = (res && angular.isArray(res.data)) ? res.data : [];
                    var meta = (res && res.meta) || {};
                    var total = angular.isNumber(meta.total) ? meta.total : rows.length;
                    loadFailed = false;
                    callback({ draw: request.draw, data: rows, recordsTotal: total, recordsFiltered: total });

                    // The page we asked for no longer exists (e.g. its last record was just
                    // removed): fall back to the last page that does.
                    if (!rows.length && total > 0 && params.page > 1 && !recovering) {
                      recovering = true;
                      table.page(Math.max(0, Math.ceil(total / length) - 1)).draw('page');
                    } else {
                      recovering = false;
                    }
                  }, function () {
                    if (destroyed) return;
                    loadFailed = true;
                    recovering = false;
                    callback({ draw: request.draw, data: [], recordsTotal: 0, recordsFiltered: 0 });
                  });
                });
              }

              function clientColumn(meta) {
                var sortGetter = meta.sort ? $parse(meta.sort) : null;
                var filterGetter = meta.filter ? $parse(meta.filter) : sortGetter;
                return {
                  orderable: !!sortGetter,
                  searchable: !!filterGetter,
                  defaultContent: '',
                  data: function (rowData, type) {
                    if (type === 'display') return '';
                    var getter = type === 'filter' ? filterGetter : sortGetter;
                    if (!getter) return '';
                    // Same context as the row template: the parent scope plus the row alias.
                    var locals = {};
                    locals[rowAlias] = rowData;
                    var value = getter(scope, locals);
                    return (value === undefined || value === null) ? '' : value;
                  }
                };
              }

              function dynamicColumn(key) {
                return {
                  title: escapeHtml(key),
                  defaultContent: '',
                  data: function (rowData, type) {
                    var value = rowData ? rowData[key] : '';
                    if (value === undefined || value === null) return '';
                    return type === 'display' ? escapeHtml(value) : value;
                  }
                };
              }

              function buildColumns(dynamicKeys) {
                if (dynamicKeys) return dynamicKeys.map(dynamicColumn);
                return columnMeta.map(function (meta) {
                  if (!serverSide) return clientColumn(meta);
                  return { data: null, defaultContent: '', orderable: !!meta.sort, name: meta.sort, searchable: false };
                });
              }

              function createTable(dynamicKeys) {
                var options = {
                  columns: buildColumns(dynamicKeys),
                  autoWidth: false,
                  order: [],
                  orderMulti: false,
                  pageLength: pageLength,
                  lengthMenu: lengthMenu,
                  searching: searchBox,
                  createdRow: createdRow,
                  drawCallback: drawCallback,
                  layout: {
                    topStart: 'pageLength',
                    topEnd: searchBox ? 'search' : null,
                    bottomStart: 'info',
                    bottomEnd: { paging: { firstLast: false, buttons: 7 } }
                  },
                  language: {
                    emptyTable: escapeHtml(emptyText),
                    zeroRecords: 'No matching records found.',
                    lengthMenu: 'Show _MENU_ _ENTRIES_',
                    info: 'Showing _START_ to _END_ of _TOTAL_ _ENTRIES-TOTAL_',
                    infoEmpty: 'Showing 0 _ENTRIES-TOTAL_',
                    infoFiltered: '(filtered from _MAX_)',
                    search: '',
                    searchPlaceholder: 'Search this table...',
                    loadingRecords: 'Loading...',
                    paginate: { previous: '\u2039 Prev', next: 'Next \u203a' }
                  }
                };
                if (serverSide) {
                  options.serverSide = true;
                  options.processing = true;
                  options.ajax = serverAjax;
                } else {
                  options.data = [];
                }
                table = new DataTable(tableEl, options);
              }

              function destroyTable() {
                destroyScopes(liveScopes);
                destroyScopes(createdScopes);
                liveScopes = [];
                createdScopes = [];
                if (table) {
                  try { table.destroy(); } catch (e) { /* table already detached */ }
                  table = null;
                }
              }

              function setRows(rows) {
                if (!table) return;
                var list = angular.isArray(rows) ? rows : [];
                // Same number of records => most likely a refresh after an edit: keep the page.
                var holdPage = table.rows().count() === list.length;
                destroyScopes(liveScopes);
                liveScopes = [];
                table.clear();
                table.rows.add(list);
                table.draw(holdPage ? false : true);
              }

              // --- Public API handed back to the controller ---------------------------------
              // Until DataTables is initialised these are no-ops: its first draw fetches anyway.
              function reload(resetPaging) {
                if (!table || !serverSide) return;
                table.draw(resetPaging ? true : 'page');
              }
              function clearOrder() {
                if (table) table.order([]);
              }
              var previousApi = { reload: config.reload, clearOrder: config.clearOrder };
              config.reload = reload;
              config.clearOrder = clearOrder;

              function init() {
                if (destroyed) return;
                if (dynamicColumns) {
                  scope.$watchCollection(attrs.dtColumns, function (keys) {
                    destroyTable();
                    tableEl.innerHTML = '';
                    if (angular.isArray(keys) && keys.length) {
                      createTable(keys.slice());
                      setRows(scope.$eval(attrs.dtData));
                    }
                  });
                } else {
                  createTable(null);
                }
                if (!serverSide) {
                  scope.$watchCollection(attrs.dtData, setRows);
                }
              }

              // Wait one tick so interpolated header text ({{ ... }}) is rendered before
              // DataTables reads the column titles.
              $timeout(init, 0);

              scope.$on('$destroy', function () {
                destroyed = true;
                destroyTable();
                if (config.reload === reload) config.reload = previousApi.reload;
                if (config.clearOrder === clearOrder) config.clearOrder = previousApi.clearOrder;
              });
            };
          }
        };
      }
    ]);
})();
