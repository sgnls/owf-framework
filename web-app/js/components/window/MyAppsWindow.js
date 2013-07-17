Ext.define('Ozone.components.window.MyAppsWindow', {
    extend: 'Ozone.components.window.ModalWindow',
    alias: 'widget.myappswindow',

    closeAction: 'hide',
    modal: true,
    preventHeader: false,
    modalAutoClose: true,
    shadow: false,
    layout: 'auto',
    ui: 'system-window',
    store: null,
    closable: true,
    title: 'My Apps',
    cls: 'system-window',
    resizable: true,
    draggable: false,

    viewId: 'dashboard-switcher-dashboard-view',

    width: 720,
    height: 525,

    normalModalHeight: 525,
    expandedModalHeight: 655,

    normalSlideHeight: 360,
    expandedSlideHeight: 490,

    dashboardContainer: null,

    //dashboard unit sizes
    dashboardItemHeight: 0,
    dashboardItemWidth: 0,

    //size of switcher in dashboard units
    minDashboardsWidth: 0,
    maxDashboardsWidth: 6,
    maxDashboardsHeight: 3,

    maxStacksPerSlide: 18,
    numDashboardsNeededToExpandModal: 12,

    isAnAppExpanded: false,

    storeLengthChanged: true,

    selectedItemCls : 'dashboard-selected',

    _deletedStackOrDashboards: null,

    DROP_LEFT_CLS: 'x-view-drop-indicator-left',
    DROP_RIGHT_CLS: 'x-view-drop-indicator-right',

    _previouslyFocusedStackOrDashboard: null,
    _previouslyHoveredStackOrDashboard: null,

    dashboardSelectionDeferred: null,

    initComponent: function() {

        var me = this,
            stackOrDashboards = [],
            stacks = {}, dashboards = {},
            dashboard, stack, model;

        for(var i = 0, len = me.dashboardStore.getCount(); i < len; i++) {

            model = me.dashboardStore.getAt(i);

            if(!model.isModifiable() || (me.hideLockedDashboards && model.data.locked)) {
                continue;
            }

            dashboard = Ext.clone(model.data);
            dashboard.model = model;
            dashboards[ dashboard.guid ] = dashboard;

            stack = dashboard.stack;
            //console.log(i, ' => Dashboard name: ', dashboard.name, 'Stack: ', stack ? stack.name : 'none', ' Default: ', dashboard.isdefault);
            if( stack ) {
                if( stacks[ stack.id ] ) {
                    stacks[ stack.id ].dashboards.push( dashboard );
                }
                else {
                    stack = Ext.clone(stack);
                    stack.isStack = true;
                    stack.dashboards = [ dashboard ];

                    stacks[ stack.id ] = stack;
                    stackOrDashboards.push( stack );
                }
            }
            else {
                stackOrDashboards.push( dashboard );
            }

        }

        me.callParent(arguments);

        me.stackOrDashboards = stackOrDashboards;
        me.dashboards = dashboards;
        me.stacks = stacks;
        me._deletedStackOrDashboards = [];

        me.tpl = new Ext.XTemplate(
            '<div class="dashboard-switcher-descriptor">All of your applications appear here. To start an App, click it. To edit or delete, hover over it and select \'Details\'.</div>',
            '<div class="all-dashboards">',
                '<tpl for=".">',
                    '<div id="{[this.getName(values)+this.getId(values)]}" class="{[this.getClass(values)]}" tabindex="0" data-{[this.getName(values)]}-id="{[this.getId(values)]}">',
                        '<div class="thumb-wrap">',
                            '{[this.getIcon(values)]}',
                        '</div>',
                        '<div class="{[this.getName(values)]}-name">',
                            '{[this.encodeAndEllipsize(values.name)]}',
                        '</div>',
                        '{[this.getActions(values)]}',
                    '</div>',
                '</tpl>',
            '</div>',
        {
            compiled: true,
            getId: function (values) {
                return values.isStack ? values.id : values.guid;
            },
            
            getClass: function (values) {
                var name = this.getName(values);
                return values.guid === me.activeDashboard.id ? name + ' ' + me.selectedItemCls: name;
            },
            
            getName: function (values) {
                return values.isStack ? 'stack' : 'dashboard';
            },

            getIcon: function(values) {
                var url = values.isStack ? values.imageUrl : values.iconImageUrl;

                if (url && !Ext.isEmpty(url.trim())) {
                    return '<div class="thumb" style="background-image: url(' + url + ') !important"></div>';
                } else {
                    return '<div class="thumb"></div>';
                }
            },
            
            getActions: function (values) {
                return	'<ul class="detail-actions hide">'+
                			'<li id="'+values.name+'-li" class="detail-action">Details'+
                        '</ul>'
            },
            
            encodeAndEllipsize: function(str) {
                //html encode the result since ellipses are special characters
                return Ext.util.Format.htmlEncode(
                    Ext.Array.map (
                        //get an array containing the first word of rowData.name as one elem, and the rest of name as another
                        Ext.Array.erase (/^([\S]+)\s*(.*)?/.exec(Ext.String.trim(str)), 0, 1),
                        function(it) {
                            //for each elem in the array, truncate it with an ellipsis if it is longer than 11 characters
                            return Ext.util.Format.ellipsis(it, 14);
                        }
                    //join the array back together with spaces
                    ).join(' ')
                );
            }
        });

        me.stackDashboardsTpl = '<div class="stack-dashboards-container">'+
                                    '<div class="stack-dashboards-anchor-tip x-tip-anchor x-tip-anchor-top"></div>'+
                                    '<div class="stack-dashboards"></div>'+
                                '</div>';
        
        me.on('afterrender', function (cmp) {
            me.tpl.overwrite( cmp.body, stackOrDashboards );

            Ext.DomHelper.append( cmp.body,
            '<div class="actions">'+
                '<ul>'+
                	'<li class="store-link-btn">'+
                        '<span class="store-link-btn-img"></span>'+
                        '<span class="store-link-btn-text">Discover More </br> in the Store</span>'+
                    '</li>'+
            		'<li class="create-link-btn">'+
                        '<span class="create-link-btn-img"></span>'+
                        '<span class="create-link-btn-text">Create New App</span>'+
                    '</li>'+
                    '<li class="create" tabindex="0" data-qtitle="Create Dashboard" data-tip="Name, describe and design a new dashboard.">+</li>'+
                '</ul>'+
            '</div>');

            cmp.actionsEl = cmp.body.select('> .actions').first();

            me.bindEvents(cmp);

            me.slider = $('.all-dashboards').bxSlider({
                oneItemPerSlide: false,
                infiniteLoop: true,
                touchEnabled: false,
                onSliderLoad: Ext.bind(function(currentIndex) {
                    // 1 slide of actual content + a clone slide on each side auto-created by the plugin
                    if ($('.bx-slide:not(.bx-clone)').length === 1) {
                        $('.bx-pager').hide();
                    }
                }, me),
                onSlideNext: Ext.bind(function() {
                    me.onSlideTransition.apply(me, arguments);
                }, me),
                onSlidePrev: Ext.bind(function() {
                    me.onSlideTransition.apply(me, arguments);
                }, me)
            });
        });

        me.on('beforeclose', me.onClose, me);
        me.on('show', me.verifyDiscoverMoreButton, me);
        me.on('show', me.initCircularFocus, me, {single: true});
        me.on('show', me.goToActiveStackSlide, me);
        me.on('show', me.focusActiveDashboard, me);
        me.mon(me.dashboardContainer, OWF.Events.Dashboard.CHANGED, me.onDashboardChanged, me);
    },

    bindEvents: function () {
        var me = this,
            $ = jQuery,
            $dom = $(me.el.dom);

        $dom
            .on('click', '.dashboard', $.proxy(me.onDashboardClick, me))
            .on('click', '.stack', $.proxy(me.onStackClick, me))
            .on('click', '.store-link-btn',  $.proxy(me.switchToMarketplace,me))
            .on('click', '.create-link-btn', $.proxy(me.createNewApp, me))
            .on('click', '.create-new-dashboard-btn', $.proxy(me.createDashboard, me))
            .on('mouseover', '.stack, .dashboard', $.proxy(me.onMouseOver, me))
            .on('mouseout', '.stack, .dashboard', $.proxy(me.onMouseLeave, me))
            .on('focus', '.stack, .dashboard', $.proxy(me.onMouseOver, me))
            .on('blur', '.stack, .dashboard', $.proxy(me.onMouseLeave, me))


        me.initKeyboardNav();

        // drag and drop
        var $draggedItem,
            $draggedItemParent,
            $dragProxy;

        // disable selection while dragging
        $dom
            .attr('unselectable', 'on')
            .css('user-select', 'none')
            .on('selectstart', false);

        // reorder dashboards
        $dom.on('mousedown', '.dashboard, .stack', function (evt) {
            $draggedItem = $(this);
            $draggedItemParent = $draggedItem.parent();

            $dragProxy = $draggedItem.clone().addClass('x-dd-drag-proxy drag-proxy');
            $('ul, .dashboard-name, .stack-name', $dragProxy).remove();
            $(document.body).append($dragProxy);

            // prevent tooltips from showing while drag n drop
            $dom.on('mouseover.reorder', '.dashboard, .stack', function (evt) { 
                evt.preventDefault();
                evt.stopPropagation();
            });

            $(document).on('mousemove.reorder', function (evt) { 
                var pageX = evt.pageX,      // The mouse position relative to the left edge of the document.
                    pageY = evt.pageY;      // The mouse position relative to the top edge of the document.

                $dragProxy.css({
                    left: pageX + 15,
                    top: pageY + 15
                });
            });

            $dom.one('mousemove.reorder', '.dashboard, .stack', function (evt) {
                var $el = $(this);
                me._hideStackDashboardsOnMove($el);
            });

            $dom.on('mousemove.reorder', '.dashboard, .stack', function (evt) { 
                var $el = $(this);

                // only allow reordering if parents match and 
                // prevent reordering stack dashboards outside of stack and vice versa.
                if($draggedItemParent[0] !== $el.parent()[0])
                    return;

                var pageX = evt.pageX,      // The mouse position relative to the left edge of the document.
                    pageY = evt.pageY,      // The mouse position relative to the top edge of the document.
                    offset = $el.offset(),  // The offset relative to the top left edge of the document.
                    width = $el.outerWidth();

                $el.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
                
                if( pageX <= offset.left + (width/2) ) {
                    $el.addClass(me.DROP_LEFT_CLS);
                }
                else {
                    $el.addClass(me.DROP_RIGHT_CLS);
                }
            });

            $dom.on('mouseleave.reorder', '.dashboard, .stack', function (evt) {
                $(this).removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            });

            // drop performed on a dashboard
            $dom.on('mouseup.reorder', '.dashboard', function (evt) {
                me._dropOnDashboard($draggedItem, $(this));
            });
            
            // drop performed on a stack
            $dom.on('mouseup.reorder', '.stack', function (evt) {
                me._dropOnStack($draggedItem, $(this));
            });

            // cleanup on mouseup
            $(document).on('mouseup.reorder', function (evt) {
                $draggedItem =  null;
                $draggedItemParent = null;
                $dragProxy.remove();

                $(document).off('.reorder');
                $dom.off('.reorder');
            });
        });
    },

    getActiveStackId: function() {
        var me = this,
            stack = this.activeDashboard.configRecord.get('stack');
            stackId = stack ? stack.id : null;

        return stackId;
    },

    getActiveStackSlideIndex: function() {
        var me = this,
            stackId = me.getActiveStackId(),
            $stackEl = $("#stack" + stackId, '.bx-slide:not(.bx-clone)'),
            $stackElSlide = $stackEl.parent()
            slideIndexOfActiveStack = $('.bx-slide:not(.bx-clone)').index($stackElSlide);

        return slideIndexOfActiveStack;
    },

    goToActiveStackSlide: function() {
        var me = this;

        me.slider.goToSlide(me.getActiveStackSlideIndex());
    },

    onSlideTransition: function($slideElement, oldIndex, newIndex) {
        var me = this,
            stackId = me.getActiveStackId();

        if (stackId && me.slideHasActiveStack(newIndex, stackId)) {
            me.focusActiveDashboard();
        } else {
            me.hideStackDashboards();
        }
    },

    slideHasActiveStack: function(slideIndex) {
        return slideIndex === this.getActiveStackSlideIndex();
    },

    _hideStackDashboardsOnMove: function ($el) {
        // hide stack dashboards if moving root stack or dashboard
        if( !($el.parent().hasClass('dashboards')) ) {
            this.hideStackDashboards();
        }
    },

    initKeyboardNav: function () {
        var me = this;

        function move ($el, $moveToEl) {
            $moveToEl.hasClass('stack') ? me._dropOnStack($el, $moveToEl) : me._dropOnDashboard($el, $moveToEl);
        }

        function moveLeft () {
            //move item left
            var $this = $(this),
                $prev = $this.prev(),
                promise;

            if($prev.length === 1 && !$prev.hasClass('dashboard') && !$prev.hasClass('stack')) {
                $prev = $prev.prev();
            }

            if($prev.length === 0)
                return;

            $prev.addClass( me.DROP_LEFT_CLS );

            if(promise = me._hideStackDashboardsOnMove($this))
                promise.then(function () {
                    move($this, $prev);
                })
            else
                move($this, $prev);
        }

        function moveRight () {
            //move item right
            var $this = $(this),
                $next = $this.next(),
                promise;
            
            if($next.length === 1 && !$next.hasClass('dashboard') && !$next.hasClass('stack')) {
                $next = $next.next();
            }

            if($next.length === 0)
                return;

            $next.addClass( me.DROP_RIGHT_CLS );
            if(promise = me._hideStackDashboardsOnMove($this))
                promise.then(function () {
                    move($this, $next);
                })
            else
                move($this, $next);
        }
            

        $(me.el.dom)
            .on('keyup', '.stack', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.onStackClick(evt);
                }
                //left bracket
                else if (evt.which == 219) {
                    moveLeft.call(this);
                }
                //right bracket
                else if (evt.which == 221) {
                    moveRight.call(this);
                }
            })
            .on('keyup', '.dashboard', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.onDashboardClick(evt);
                }
                //left bracket
                else if (evt.which == 219) {
                    moveLeft.call(this);
                }
                //right bracket
                else if (evt.which == 221) {
                    moveRight.call(this);
                }
            })
            .on('focus', '.dashboard, .stack', function (evt) {
                $(evt.currentTarget).addClass(me.selectedItemCls);
            })
            .on('blur', '.dashboard, .stack', function (evt) {
                me._previouslyFocusedStackOrDashboard = $(evt.currentTarget).removeClass(me.selectedItemCls);
            })
            .on('focus', '.dashboard-actions li, .stack-actions li', function (evt) {
                $(evt.currentTarget).addClass('hover');
            })
            .on('blur', '.dashboard-actions li, .stack-actions li', function (evt) {
                $(evt.currentTarget).removeClass('hover');
            })
            .on('keyup', '.dashboard-actions .restore', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.restoreDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .share', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.shareDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .edit', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.editDashboard(evt);
                }
            })
            .on('keyup', '.dashboard-actions .delete', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.deleteDashboard(evt);
                }
            })
            .on('keyup', '.stack-actions .restore', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.restoreStack(evt);
                }
            })
            .on('keyup', '.stack-actions .delete', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.deleteStack(evt);
                }
            })
            .on('focus', '.create', function (evt) {
                $(evt.currentTarget).addClass('selected');
            })
            .on('blur', '.create', function (evt) {
                $(evt.currentTarget).removeClass('selected');
            })
            .on('keyup', '.create', function (evt) {
                if(evt.which === Ext.EventObject.ENTER) {
                    me.createDashboard(evt);
                }
            });
    },


    _dropOnDashboard: function ($draggedItem, $dashboard) {
        var me = this,
            dashboard = me.getDashboard( $dashboard ),
            draggedItem;
        
        // dropped on the same element
        if($dashboard[0] === $draggedItem[0]) {
            $dashboard.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            return;
        }

        var droppedLeft = $dashboard.hasClass(me.DROP_LEFT_CLS);
        var store = me.dashboardStore, newIndex, oldIndex;

        oldIndex = $draggedItem.index();

        if ( droppedLeft ) {
            $dashboard.removeClass(me.DROP_LEFT_CLS);
            $draggedItem.insertBefore( $dashboard );
        }
        else {
            $dashboard.removeClass(me.DROP_RIGHT_CLS);
            $draggedItem.insertAfter( $dashboard );
        }

        newIndex = $draggedItem.index();

        //console.log(oldIndex, newIndex);

        // dropping dashboard on a dashboard
        if( $draggedItem.hasClass('dashboard') ) {
            draggedItem = me.getDashboard( $draggedItem );

            store.remove(draggedItem.model, true);

            var index = store.indexOf(dashboard.model);
            
            if ( !droppedLeft ) {
                index++;
            }

            store.insert(index, draggedItem.model);

            // if stack, reorder internal cache as well.
            if(draggedItem.stack) {
                var stack = me.stacks[draggedItem.stack.id];
                stack.dashboards.splice(newIndex, 0, stack.dashboards.splice(oldIndex, 1)[0]);
            }

        }
        else {
            // dropping stack on a dashboard

            draggedItem = me.getStack( $draggedItem );

            var stackDashboards = draggedItem.dashboards,
                stackDashboard;

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.remove(stackDashboard.model, true);
            }

            index = store.indexOf(dashboard.model);

            if ( !droppedLeft ) {
                index++;
            }
            
            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.insert(index++, stackDashboard.model);
            }

        }

        $draggedItem.focus();
        me.initCircularFocus();
        me.reordered = true;
    },

    _dropOnStack: function ($draggedItem, $stack) {
        var me = this,
            stack = me.getStack( $stack ),
            draggedItem;
        
        // dropped on the same element
        if($stack[0] === $draggedItem[0]) {
            $stack.removeClass(me.DROP_LEFT_CLS + ' ' + me.DROP_RIGHT_CLS);
            return;
        }

        store = me.dashboardStore;

        var droppedLeft = $stack.hasClass(me.DROP_LEFT_CLS);
        var store = me.dashboardStore;

        // dropping dashboard on a stack
        if( $draggedItem.hasClass('dashboard') ) {

            draggedItem = me.getDashboard( $draggedItem );
            
            store.remove(draggedItem.model, true);

            var index;
            if ( droppedLeft ) {
                index = store.indexOf(stack.dashboards[0].model);
            }
            else {

                var $next = $stack.next();

                if($next.length === 1 && !$next.hasClass('dashboard') && !$next.hasClass('stack')) {
                    $next = $next.next();
                }

                if( $next.length === 1) {

                    if( $next.hasClass('dashboard') ) {
                        var nextDash = me.getDashboard( $next );
                        index = store.indexOf(nextDash.model);
                    }
                    else {
                        // next item is a stack
                        // get the index of the first dashboard in the stack
                        var nextStack = me.getStack( $next );
                        index = store.indexOf(nextStack.dashboards[0].model);
                    }
                }
                else {
                    var lastStackDash = stack.dashboards[ stack.dashboards.length - 1 ];
                    index = store.indexOf(lastStackDash.model);
                    index++;
                }
            }

            store.insert(index, draggedItem.model);
        }
        else {
            // dropping stack on a stack
            draggedItem = me.getStack( $draggedItem );

            var stackDashboards = draggedItem.dashboards,
                stackDashboard;

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.remove(stackDashboard.model, true);
            }

            if ( droppedLeft ) {
                index = store.indexOf(stack.dashboards[0].model);
            }
            else {
                var $next = $stack.next();

                if( $next.length === 1) {
                    if( $next.hasClass('dashboard') ) {
                        var nextDash = me.getDashboard( $next );
                        index = store.indexOf(nextDash.model);
                    }
                    else {
                        // next item is a stack
                        // get the index of the first dashboard in the stack
                        var nextStack = me.getStack( $next );
                        index = store.indexOf(nextStack.dashboards[0].model);
                    }
                }
                else {
                    var lastStackDash = stack.dashboards[ stack.dashboards.length - 1 ];
                    index = store.indexOf(lastStackDash.model);
                    index++;
                }
            }

            for(var i = 0, len = stackDashboards.length; i < len; i++) {
                stackDashboard = stackDashboards[i];
                store.insert(index++, stackDashboard.model);
            }
        }

        if ( droppedLeft ) {
            $stack.removeClass(me.DROP_LEFT_CLS);
            $draggedItem.insertBefore( $stack );
        }
        else {
            $stack.removeClass(me.DROP_RIGHT_CLS);
            $draggedItem.insertAfter( $stack );
        }

        $draggedItem.focus();
        me.initCircularFocus();
        me.reordered = true;
    },

    initCircularFocus: function () {
        var firstEl = this.body.down('.all-dashboards').first(),
            addBtnEl = this.body.down('.actions').last();

        this.tearDownCircularFocus();
        this.setupFocus(firstEl, addBtnEl);
    },

    focusActiveDashboard: function () {
        var me = this,
            activeDashboardId = this.activeDashboard.id,
            selectedEl = $('#dashboard'+activeDashboardId);

        // dashboard item view not found in switcher, active dashboard must be in a stack.
        // expand the stack, then focus the active dashboard
        if(selectedEl.length === 0) {
            var stackId, stack;

            stack = this.activeDashboard.configRecord.get('stack');
            stackId = stack ? stack.id : null;

            if (stack) {
                this.toggleStack(this.stacks[stackId], $('#stack'+stackId, '.bx-slide:not(.bx-clone)')).then(function () {
                    me.focusActiveDashboard();
                });
            }
            return;
        }
    },

    getDashboard: function ($el) {
        return this.dashboards[ $el.attr('data-dashboard-id') ];
    },

    getStack: function ($el) {
        return this.stacks[ $el.attr('data-stack-id') ];
    },

    getElByClassFromEvent: function (evt, cls) {
        var $dashboard = $(evt.currentTarget || evt.target);
        return $dashboard.hasClass('cls') ? $dashboard : $dashboard.parents('.' + cls);
    },

    onDashboardClick: function (evt) {
        if (evt.type !== 'click' && evt.which !== Ext.EventObject.ENTER)
            return;
        
        var $clickedDashboard = $(evt.currentTarget),
        dashboard = this.getDashboard( $clickedDashboard );

        if ($(evt.target).hasClass('detail-action')) {
        	Ext.select('.itemTip').destroy()
        	
        	Ext.widget('mypagetip', {
        		clickedStackOrDashboard:dashboard,
                $dashboard: $clickedDashboard,
                dashboardContainer: this.dashboardContainer,
                appsWindow: this,
        		event:evt
        	}).showAt([evt.clientX,evt.clientY]);
        	
        	return;
        }
            
        var stackContext = dashboard.stack ? dashboard.stack.stackContext : null;

        this.dashboardSelectionDeferred && this.dashboardSelectionDeferred.resolve(dashboard.guid);
        this.dashboardSelectionDeferred = null;

        this.activateDashboard(dashboard.guid, stackContext);
    },

    getDashboardSelectionPromise: function() {
        this.dashboardSelectionDeferred = this.dashboardSelectionDeferred || $.Deferred();
        return this.dashboardSelectionDeferred.promise();
    },

    onDashboardChanged: function() {
        var activeDashboardId = this.dashboardContainer.activeDashboard.id,
            $selectedDashboard = $('#dashboard'+activeDashboardId);

        $selectedDashboard.addClass( this.selectedItemCls );

        if( this._$lastSelectedDashboard ) {
            this._$lastSelectedDashboard.removeClass( this.selectedItemCls );
        }

        this._$lastSelectedDashboard = $selectedDashboard;
    },

    onStackClick: function (evt) {
        // evt.which == 1 => left mousedown
        if(evt.type === 'click' || evt.which === Ext.EventObject.ENTER) {
            var me = this,
                $ = jQuery,
                $clickedStack = $(evt.currentTarget),
                stack = me.getStack( $clickedStack );
            
            if ($(evt.target).hasClass('detail-action')) {
            	Ext.select('.itemTip').destroy()
            	
            	Ext.widget('myapptip', {
            		clickedStackOrDashboard:stack,
                    dashboardContainer: me.dashboardContainer,
                    appsWindow: me,
            		event:evt
            	}).showAt([evt.clientX,evt.clientY]);
            	
            	return;
            }

            if( stack ) {
                me.toggleStack(stack, $clickedStack);
            }
            evt.preventDefault();
        }
    },

    toggleStack: function (stack, $stack) {
        var me = this,
            dfd = $.Deferred();

        if( me._lastExpandedStack ) {
            if( me._lastExpandedStack === stack ) {
                return me.hideStackDashboards();
            }
            else {
                me.hideStackDashboards().then(function () {
                    me.showStackDashboards(stack, $stack, dfd);
                });
            }
        }
        else  {
            me.showStackDashboards(stack, $stack, dfd);
        }

        return dfd.promise();
    },

    showStackDashboards: function (stack, $clickedStack, dfd) {
        var me = this,
            clickedStackElWidth = $clickedStack.outerWidth( true ),
            clickedStackElHeight = $clickedStack.outerHeight( true ),
            parent = $clickedStack.parent(),
            parentWidth = parent.outerWidth( true ),
            lastElInRow;

        // get last element in the clikced stack's row
        var numItemsInRow = Math.round( parentWidth / clickedStackElWidth ),
            totalItems = $(parent).children('.dashboard, .stack').length,
            clickedStackIndex = $clickedStack.index() + 1;

        if( clickedStackIndex === totalItems || (clickedStackIndex % numItemsInRow) === 0 ) {
            lastElInRow = $clickedStack;
        }
        else {
            var i = clickedStackIndex;
            while( (i % numItemsInRow) !== 0 ) {
                i++;
                if( i >= totalItems ) {
                    break;
                }
            }
            lastElInRow = parent.children().eq(i-1);
        }

        // compile template and add to dom
        this.$stackDashboards = $( this.stackDashboardsTpl );
        this.$stackDashboards.children('.stack-dashboards').html( this.tpl.applyTemplate( stack.dashboards ) )
        this.$stackDashboards.insertAfter( lastElInRow );

        this.stackDashboardsAnchorTip = $( '.stack-dashboards-anchor-tip' , this.$stackDashboards );

        // cache size of tip
        if( !this.stackDashboardsAnchorTipHeight ) {
            this.stackDashboardsAnchorTipHeight = this.stackDashboardsAnchorTip.outerHeight();
        }
        if( !this.stackDashboardsAnchorTipWidth ) {
            this.stackDashboardsAnchorTipWidth = this.stackDashboardsAnchorTip.outerWidth();
        }

        this.$stackDashboards.hide();

        // calculate top and left value for anchor tip
        var parentPosition = $clickedStack.position(),
            top = parentPosition.top + clickedStackElHeight - (this.stackDashboardsAnchorTipHeight),
            left = parentPosition.left + (clickedStackElWidth / 2) - (this.stackDashboardsAnchorTipWidth / 2);
        
        this.stackDashboardsAnchorTip.css({
            left: left + 'px'
        });

        if (totalItems > me.numDashboardsNeededToExpandModal) {
            me.expandModal(parent);
        }

        me.isAnAppExpanded = true;

        if(Ext.isIE7 || Ext.isIE8) {
            this.$stackDashboards.show();
            dfd.resolve();
        }
        else {
            this.$stackDashboards.slideDown('fast').promise().then(function () {
                dfd.resolve();
            });
        }

        this._lastExpandedStack = stack;
    },

    expandModal: function(containerSlide) {
        var me = this;

        me.setHeight(me.expandedModalHeight);
        $('.bx-wrapper, .bx-viewport, .bx-slide:not(.bx-clone)', me.el.dom).height(me.expandedSlideHeight);
    },

    collapseModal: function(containerSlide) {
        var me = this;

        me.setHeight(me.normalModalHeight);
        $('.bx-wrapper, .bx-viewport, .bx-slide:not(.bx-clone)', me.el.dom).height(me.normalSlideHeight);
    },

    hideStackDashboards: function () {
        var me = this;
        if(!this.$stackDashboards) {
            var dfd = $.Deferred();
            dfd.resolve();
            return dfd.promise();
        }

        me.isAnAppExpanded = false;

        if(Ext.isIE7 || Ext.isIE8) {
            var dfd = $.Deferred();
            this.$stackDashboards && this.$stackDashboards.hide();
            dfd.resolve();

            me.collapseModal();
            this.$stackDashboards.remove();
            this._lastExpandedStack = null;
            
            return dfd.promise();
        }
        else {
            var promise = this.$stackDashboards.slideUp('fast').promise();
            promise.then(function () {
                me.collapseModal();
                me.$stackDashboards.remove();
                me._lastExpandedStack = null;
            });
            return promise;
        }
    },

    onMouseOver: function (evt) {
        var el = $(evt.currentTarget);

        //if ( this.isAnAppExpanded || 
         //   !this.isAnAppExpanded && $(el).hasClass('stack')) {

            if (this._previouslyHoveredStackOrDashboard != null) {
                $('.detail-actions', this._previouslyHoveredStackOrDashboard).addClass('hide');
            }
            
            $('.detail-actions', el).removeClass('hide');
       // }

        this._previouslyHoveredStackOrDashboard = el;
    },

    onMouseLeave: function(evt) {
        var el = $(evt.currentTarget);

        if (this._previouslyHoveredStackOrDashboard) {
            $('.detail-actions', this._previouslyHoveredStackOrDashboard).addClass('hide');
        }
    },

    updateDashboardEl: function ($dashboard, dashboard) {
        var $el = $(this.tpl.apply([dashboard])).insertBefore($dashboard);
        $dashboard.remove();
        $el.focus();
    },
    
    updateStackDashboardsEl: function (stack) {
    	if(this.$stackDashboards) {
    		this.$stackDashboards.children('.dashboards').html( this.tpl.applyTemplate( stack.dashboards ) )
    	}
    },
    
    switchToMarketplace: function() {
    	var mpButton = $('.marketBtn')
    	
    	if(mpButton && mpButton.is(':visible')) {
    		mpButton.click()
    		this.close();
    	}
    },
    
    verifyDiscoverMoreButton: function() {
        var discoverMoreButton = $('.store-link-btn');
        var marketBtn = $('.marketBtn');
    	
        if(marketBtn && $(marketBtn).is(':visible')) {
        	discoverMoreButton.show();
        } else {
        	discoverMoreButton.hide();
        }
    },

    restoreDashboard: function (evt) {
        evt.stopPropagation();
        var me = this,
            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboard = this.getDashboard($dashboard),
            dashboardGuid = dashboard.guid;

        this.warn('This action will return the dashboard <span class="heading-bold">' + Ext.htmlEncode(dashboard.name) + '</span> to its current default state. If an administrator changed the dashboard after it was assigned to you, the default state may differ from the one that originally appeared in your Switcher.', function () {
            Ext.Ajax.request({
                url: Ozone.util.contextPath() + '/dashboard/restore',
                params: {
                    guid: dashboardGuid,
                    isdefault: dashboardGuid == me.activeDashboard.guid
                },
                success: function(response, opts) {
                    var json = Ext.decode(response.responseText);
                    if (json != null && json.data != null && json.data.length > 0) {
                        me.notify('Restore Dashboard', '<span class="heading-bold">' + Ext.htmlEncode(dashboard.name) + '</span> is restored successfully to its default state!');

                        var name = json.data[0].name,
                            description = json.data[0].description;

                        dashboard.model.set({
                            'name': name,
                            'description': description
                        });
                        dashboard.name = name;
                        dashboard.description = name;

                        me.updateDashboardEl($dashboard, dashboard);

                        me.reloadDashboards = true;
                    }
                },
                failure: function(response, opts) {
                    Ozone.Msg.alert('Dashboard Manager', "Error restoring dashboard.", function() {
                        Ext.defer(function() {
                            $dashboard[0].focus();
                        }, 200, me);
                    }, me, null, me.dashboardContainer.modalWindowManager);
                    return;
                }
            });
        }, function () {
            evt.currentTarget.focus();
        });
    },

    shareDashboard: function (evt) {
        evt.stopPropagation();

        var $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
            dashboardGuid = this.getDashboard($dashboard).guid,
            dashboardIndex = this.dashboardContainer.dashboardStore.find('guid', dashboardGuid),
            dashboard = this.dashboardContainer.dashboardStore.getAt(dashboardIndex).data,
            dashboardModel = dashboard.model;

        //If exporting the current dashboard, regenerate the json to ensure changes
        //not yet pushed to the server are in the exported json
        if(this.dashboardContainer.activeDashboard.configRecord.data.guid === dashboard.guid) {
            dashboard = this.dashboardContainer.activeDashboard.getJson();
        }

        // delete model before cloning to remove circular refs
        delete dashboard.model;
        var cloneDashboard = Ozone.util.cloneDashboard(dashboard, false, true);

        // reset dashboard model
        dashboard.model = dashboardModel;

        // Stop unload event from firing long enough to submit form.
        // Have to do this because the form submit triggers the window's unload event
        // which causes competing requests.  (SEE OWF-4280)
        Ext.EventManager.un(window, 'beforeunload', this.dashboardContainer.onBeforeUnload);

        var elForm = document.createElement('form');
        var elInput = document.createElement('input');
        elInput.id = 'json';
        elInput.name = 'json';
        elInput.type = 'hidden';
        elInput.value = Ext.JSON.encode(cloneDashboard);
        elForm.appendChild(elInput);
        elForm.action = Ozone.util.contextPath() + '/servlet/ExportServlet';
        elForm.method = 'POST';
        elForm.enctype = elForm.encoding = 'multipart/form-data';
        document.body.appendChild(elForm);
        elForm.submit();
        document.body.removeChild(elForm);
        elForm = null;
        elInput = null;
        var dmScope = this;
        setTimeout(function() {
            Ext.EventManager.on(window, 'beforeunload', dmScope.dashboardContainer.onBeforeUnload, dmScope.dashboardContainer);
        }, 100);
    },




        createNewApp: function (evt) {
        var me = this,
            createDashWindow = Ext.widget('createdashboardwindow', {
                stackId: null,
                title: Ozone.ux.DashboardMgmtString.createNewAppTitle,
                headerText: Ozone.ux.DashboardMgmtString.createNewAppHeader,
                itemId: 'createDashWindow',
                dashboardContainer: me.dashboardContainer,
                ownerCt: me.dashboardContainer
            });

        createDashWindow.show();
        me.close();
    },

//    addPageToApp: function (evt) {
//        var me = this,
//            $stack = this.getElByClassFromEvent(evt, 'stack'),
//            stack = this.getStack($stack),
//            createDashWindow = Ext.widget('createdashboardwindow', {
//                stackId: stack.id,
//                title: Ozone.ux.DashboardMgmtString.createNewPageTitle,
//                headerText: Ozone.ux.DashboardMgmtString.createNewPageHeader,
//                itemId: 'createDashWindow',
//                dashboardContainer: me.dashboardContainer,
//                ownerCt: me.dashboardContainer
//            });
//
//        createDashWindow.show();
//        me.close();
//    },

    createDashboard: function (evt) {
        var me = this,
            createDashWindow = Ext.widget('createdashboardwindow', {
                createNewApp: false,
                title: Ozone.ux.DashboardMgmtString.createNewPageTitle,
                headerText: Ozone.ux.DashboardMgmtString.createNewPageHeader,
                itemId: 'createDashWindow',
                dashboardContainer: me.dashboardContainer,
                ownerCt: me.dashboardContainer
            });

        createDashWindow.show();
        me.close();
    },

//    editDashboard: function (evt) {
//        evt.stopPropagation();
//
//        var me = this,
//            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
//            dashboard = this.getDashboard($dashboard);
//
//        var editDashWindow = Ext.widget('createdashboardwindow', {
//            itemId: 'editDashWindow',
//            title: 'Edit Dashboard',
//            height: 250,
//            dashboardContainer: this.dashboardContainer,
//            ownerCt: this.dashboardContainer,
//            hideViewSelectRadio: true,
//            existingDashboardRecord: dashboard.model
//       }).show();
//
//       this.close();
//    },

//    deleteDashboard: function (evt) {
//        evt.stopPropagation();
//
//        var me = this,
//            $dashboard = this.getElByClassFromEvent(evt, 'dashboard'),
//            dashboard = this.getDashboard($dashboard),
//            msg;
//
//        function focusEl () {
//            evt.currentTarget.focus();
//        }
//
//        // Only allow the App owner to delete an App page
//        if(dashboard.stack && Ozone.config.user.displayName !== dashboard.stack.owner.username) {
//            this.warn('Users cannot remove individual pages from an App. Please contact your administrator.', focusEl);
//            return;
//        }
//
//        // Only allow deleting a dashboard if its only group is a stack (and we applied the stack membership rule before)
//        if(!dashboard.groups || dashboard.groups.length == 0 || (dashboard.groups.length == 1 && dashboard.groups[0].stackDefault)) {
//            msg = 'This action will permanently delete <span class="heading-bold">' + Ext.htmlEncode(dashboard.name) + '</span>.';
//
//            this.warn(msg, function () {
//                me.dashboardStore.remove(dashboard.model);
//                me.dashboardStore.save();
//                me.notify('Delete Dashboard', '<span class="heading-bold">' + Ext.htmlEncode(dashboard.name) + '</span> deleted!');
//
//                me._deletedStackOrDashboards.push(dashboard);
//                me.reloadDashboards = true;
//
//                var $prev = $dashboard.prev();
//                $dashboard.remove();
//                $prev.focus();
//
//            }, focusEl);
//        } else {
//            this.warn('Users cannot remove dashboards assigned to a group. Please contact your administrator.', focusEl);
//        }
//    },

    restoreStack: function (evt) {
        evt.stopPropagation();
        var me = this,
            $stack = this.getElByClassFromEvent(evt, 'stack'),
            stack = this.getStack($stack);
        
        this.warn('This action will return the stack <span class="heading-bold">' + Ext.htmlEncode(stack.name) + '</span> to its current default state. If an administrator changed any dashboard in the stack after it was assigned to you, the default state may differ from the one that originally appeared in your Switcher.', function () {
            Ext.Ajax.request({
                url: Ozone.util.contextPath() + '/stack/restore',
                params: {
                    id: stack.id
                },
                success: function(response, opts) {
                    var json = Ext.decode(response.responseText);
                    
                    if (json != null && json.updatedDashboards != null && json.updatedDashboards.length > 0) {
                        me.notify('Restore Stack', '<span class="heading-bold">' + Ext.htmlEncode(stack.name) + '</span> is restored successfully to its default state!');
                        
                        var dashboards = stack.dashboards;
                        for(var i = 0; i < dashboards.length; i++) {
                        	for(var j = 0; j < json.updatedDashboards.length; j++) {
                        		var dash = json.updatedDashboards[j];
                        		if(dash.guid == dashboards[i].guid) {
                        			dashboards[i].model.set({
                                        'name': dash.name,
                                        'description': dash.description
                                    });
                                    dashboards[i].name = dash.name;
                                    dashboards[i].description = dash.description;
                        		}
                        	}
                        }
                        
                        me.updateStackDashboardsEl(stack);
                        me.reloadDashboards = true;
                        $stack.focus();
                    }
                },
                failure: function(response, opts) {
                    Ozone.Msg.alert('Dashboard Manager', "Error restoring stack.", function() {
                        Ext.defer(function() {
                            $stack[0].focus();
                        }, 200, me);
                    }, me, null, me.dashboardContainer.modalWindowManager);
                    return;
                }
            });
        }, function () {
            evt.currentTarget.focus();
        });
    },

    deleteStack: function (evt) {
        evt.stopPropagation();

        var me = this,
            $stack = this.getElByClassFromEvent(evt, 'stack'),
            stack = this.getStack($stack),
            msg = 'This action will permanently delete stack <span class="heading-bold">' 
                    + Ext.htmlEncode(stack.name) + '</span> and its dashboards.';

        function focusEl () {
            evt.currentTarget.focus();
        }

        var stackGroups = stack.groups,
            userGroups = Ozone.config.user.groups,
            groupAssignment = false;
        
        if(stackGroups && userGroups && stackGroups.length > 0 && userGroups.length > 0) {
            for (var i = 0, len1 = stackGroups.length; i < len1; i++) {
                var stackGroup = stackGroups[i];
                
                for (var j = 0, len2 = userGroups.length; j < len2; j++) {
                    var userGroup = userGroups[j];
                    if(stackGroup.id === userGroup.id) {
                        groupAssignment = true;
                        break;
                    }
                }

                if(groupAssignment === true)
                    break;
            }
        }

        if(groupAssignment) {
            this.warn('Users in a group cannot remove stacks assigned to the group. Please contact your administrator.', focusEl);
            return;
        }

        this.warn(msg, function () {
            me.dashboardContainer.stackStore.remove( me.dashboardContainer.stackStore.getById(stack.id) );
            me.dashboardContainer.stackStore.save();

            if( me._lastExpandedStack === stack) {
                me.hideStackDashboards();
            }

            var $prev = $stack.prev();
            $stack.remove();
            $prev.focus();
            
            me._deletedStackOrDashboards.push(stack);
            me.reloadDashboards = true;

        }, focusEl);
    },

    warn: function (msg, okFn, cancelFn) {
        Ext.widget('alertwindow',{
            title: "Warning",
            html:  msg,
            minHeight: 115,
            dashboardContainer: this.dashboardContainer,
            okFn: okFn,
            cancelFn: cancelFn,
            cls: 'alert-window-widget',
            showCancelButton: !!cancelFn
        }).show();
    },

    notify: function  (title, msg, type /* default is success*/) {
        var stack_bottomright = {"dir1": "up", "dir2": "left", "firstpos1": 25, "firstpos2": 25};
        $.pnotify({
            title: title,
            text: msg,
            type: type || 'success',
            addclass: "stack-bottomright",
            stack: stack_bottomright,
            history: false,
            sticker: false,
            icon: false,
            delay: 3000
        });
    },

    activateDashboard: function (guid, stackContext) {
        this.close();
        this.dashboardContainer.activateDashboard(guid, false, stackContext);
    },

    updateWindowSize: function() {
        var newWidth,
            newHeight,
            dashboards = this.body.select('> .all-dashboards').first(),
            item = dashboards.first().dom, //first dashboard/stack
            header = this.header;
        
        if(!item)
            return;

        var itemEl = Ext.get(item),
            windowEl = this.getEl(),
            widthMargin = itemEl.getMargin('lr'),
            heightMargin = itemEl.getMargin('tb'),
            totalDashboards = dashboards.query('> .dashboard, > .stack').length,
            dashboardInRow = 0;

        this.dashboardItemWidth = itemEl.getWidth();
        this.dashboardItemHeight = itemEl.getHeight();

        if(totalDashboards < this.minDashboardsWidth) {
            dashboardInRow = this.minDashboardsWidth;
        }
        else if (totalDashboards > this.maxDashboardsWidth) {
            dashboardInRow = this.maxDashboardsWidth;
        }
        else {
            dashboardInRow = totalDashboards;
        }

        newWidth = (this.dashboardItemWidth + widthMargin + 1) * dashboardInRow;

        if(totalDashboards > this.maxDashboardsWidth * this.maxDashboardsHeight) {
            // add 30 to accomodate for scrollbar
            newWidth += 30;
        }

        newHeight = (this.dashboardItemHeight + heightMargin) * this.maxDashboardsHeight;

        this.body.setSize(newWidth + 30);
        
        //the extra 70 is for the stack row's triangle thing
        dashboards.setStyle('max-height', newHeight - this.actionsEl.getHeight() + 70 + 'px');

        //relayout header to account for new size.
        //suspend layout of this component so header layout doesn't resize the
        //whole window
        this.suspendLayout = true;
        header.doComponentLayout(this.getWidth());
        this.suspendLayout = false;
    },

    saveDashboardOrder: function () {
        var dfd = $.Deferred();
        var gridData = this.dashboardStore.data.items;
        var viewsToUpdate = [];
        var viewGuidsToDelete = [];
    
        for (var i = 0; i < gridData.length; i++) {
            if (!gridData[i].data.removed) {
                viewsToUpdate.push({
                    guid: gridData[i].data.guid,
                    isdefault: gridData[i].data.isdefault,
                    name: gridData[i].data.name.replace(new RegExp(Ozone.lang.regexLeadingTailingSpaceChars), '')
                });
            } else {
                viewGuidsToDelete.push(gridData[i].data.guid);
            }
        }

        Ozone.pref.PrefServer.updateAndDeleteDashboards({
            viewsToUpdate: viewsToUpdate,
            viewGuidsToDelete: viewGuidsToDelete,
            updateOrder: true,
            onSuccess: function() {
                dfd.resolve();
            },
            onFailure: function() {
                dfd.reject();
            }
        });

        return dfd.promise();
    },

    onClose: function() {
        var me = this;
        
        Ext.select('.itemTip').destroy();

        //me.tearDownCircularFocus();

        this.dashboardSelectionDeferred && this.dashboardSelectionDeferred.state() == "pending" && this.dashboardSelectionDeferred.reject();
        this.dashboardSelectionDeferred = null;

        // refresh if user deleted all dashboards
        if(me.dashboardContainer.dashboardStore.getCount() === 0) {
            window.location.reload();
            return;
        }

        if (me.reordered) {
            if(me.reloadDashboards) {
                me.saveDashboardOrder().always(function () {
                    me.dashboardContainer.reloadDashboards();
                });
            }
            else {
                me.saveDashboardOrder().fail(function () {
                    me.dashboardContainer.reloadDashboards();
                });
            }
        }
        else if(me.reloadDashboards === true) {
            me.dashboardContainer.reloadDashboards();
        }
    },

    destroy: function () {
        this.tearDownCircularFocus();

        // remove jQuery listeners
        if (this.el && this.el.dom) {
            $(this.el.dom).off();
        }

        // destroy view so that it will be recreated when opened next setTimeout
        return this.callParent();
    }
});
