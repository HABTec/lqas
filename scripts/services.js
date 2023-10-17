/* global angular, moment, dhis2 */

'use strict';

/* Services */

var lqasServices = angular.module('lqasServices', ['ngResource'])

.factory('StorageService', function(){
    var store = new dhis2.storage.Store({
        name: "dhis2cr",
        adapters: [dhis2.storage.IndexedDBAdapter, dhis2.storage.DomSessionStorageAdapter, dhis2.storage.InMemoryAdapter],
        objectStores: ['dataSets', 'periodTypes', 'categoryCombos', 'dataElementGroups', 'categoryOptionGroupSets', 'organisationUnitGroupSets']
    });
    return{
        currentStore: store
    };
})

/* service for handling offline data */
.factory('OfflineDataValueService', function($http, $q, $rootScope, $translate, StorageService, ModalService, NotificationService){
    return {
        hasLocalData: function() {
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getKeys('dataValues').done(function(events){
                    $rootScope.$apply(function(){
                        def.resolve( events.length > 0 );
                    });
                });
            });
            return def.promise;
        },
        getLocalData: function(){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll('dataValues').done(function(dataValues){
                    $rootScope.$apply(function(){
                        def.resolve({dataValues: dataValues});
                    });
                });
            });
            return def.promise;
        },
        uploadLocalData: function(){
            var def = $q.defer();
            this.getLocalData().then(function(localData){
                var dataValueSet = {dataValues: []};
                angular.forEach(localData.dataValues, function(dv){
                    delete dv.id;
                    dataValueSet.dataValues.push(dv);
                });

                $http.post(DHIS2URL + '/api/dataValueSets.json', dataValueSet ).then(function(response){
                    dhis2.lqas.store.removeAll( 'dataValues' );
                    NotificationService.displayDelayedHeaderMessage( $translate.instant('upload_success') );
                    log( 'Successfully uploaded local data values' );
                    def.resolve();
                }, function( error ){
                    var serverLog = '';
                    if( error && error.data && error.data.response && error.data.response.importSummaries ){
                        angular.forEach(error.data.response.importSummaries, function(is){
                            if( is.description ){
                                serverLog += is.description + ';  ';
                            }
                        });
                    }

                    var modalOptions = {
                        closeButtonText: 'keep_offline_data',
                        actionButtonText: 'delete_offline_data',
                        headerText: 'error',
                        bodyText: $translate.instant('data_upload_to_server_failed:') + '  ' + serverLog
                    };

                    var modalDefaults = {
                        backdrop: true,
                        keyboard: true,
                        modalFade: true,
                        templateUrl: 'views/modal-offline.html'
                    };


                    ModalService.showModal(modalDefaults, modalOptions).then(function(result){
                        dhis2.lqas.store.removeAll( 'dataValues' );
                        NotificationService.displayDelayedHeaderMessage( $translate.instant('offline_data_deleted') );
                        def.resolve();
                    }, function(){
                        NotificationService.displayDelayedHeaderMessage( $translate.instant('upload_failed_try_again') );
                        def.resolve();
                    });
                });
            });
            return def.promise;
        }
    };
})

/* Factory to fetch data element groups */
.factory('DataElementGroupFactory', function($q, $rootScope, StorageService) {

    return {
        getControllingDataElementGroups: function(){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll('dataElementGroups').done(function(dgs){
                    var degs = [];
                    angular.forEach(dgs, function(dg){
                        if(dg.data_controller_group){
                            dg.isDisabled = true;
                            var des = [];
                            des = $.map(dg.dataElements, function(de){return de.id;});
                            dg.dataElements = des;
                            degs.push(dg);
                        }
                    });

                    $rootScope.$apply(function(){
                        def.resolve( degs );
                    });
                });
            });
            return def.promise;
        },
        getNonControllingDataElementGroups : function(){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll('dataElementGroups').done(function(dgs){
                    var degs = [];
                    angular.forEach(dgs, function(dg){
                        if(dg.data_controller_group){
                            return; //jump if the data element group is a controlling data element group
                        }
                        else {
                            var des=[];
                            des=$.map(dg.dataElements,function(de){dg.dataElements[de.id]=de});
                            degs.push(dg);
                        }
                    });

                    $rootScope.$apply(function(){
                        def.resolve( degs );
                    });
                });
            });
            return def.promise;
        }
    };
})

/* factory to fetch and process programValidations */
.factory('MetaDataFactory', function($q, $rootScope, StorageService, orderByFilter) {

    return {
        get: function(store, uid){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.get(store, uid).done(function(obj){
                    $rootScope.$apply(function(){
                        def.resolve(obj);
                    });
                });
            });
            return def.promise;
        },
        set: function(store, obj){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.set(store, obj).done(function(obj){
                    $rootScope.$apply(function(){
                        def.resolve(obj);
                    });
                });
            });
            return def.promise;
        },
        getAll: function(store){
            var def = $q.defer();
            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll(store).done(function(objs){
                    objs = orderByFilter(objs, '-displayName').reverse();
                    $rootScope.$apply(function(){
                        def.resolve(objs);
                    });
                });
            });
            return def.promise;
        }
    };
})

/* Factory to fetch data sets */
        .factory('DataSetFactory', function ($q, $rootScope, StorageService, orderByFilter, DataEntryUtils) {

    return {
        get: function(uid){

            var def = $q.defer();

            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.get('dataSets', uid).done(function(ds){
                    ds = DataEntryUtils.processDataSet( ds );
                    $rootScope.$apply(function(){
                        def.resolve(ds);
                    });
                });
            });
            return def.promise;
        },
        getByOu: function(ou, selectedDataSet){
            var def = $q.defer();

            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll('dataSets').done(function(dss){
                    var dataSets = [];
                    angular.forEach(dss, function(ds){
                        if ( ds.organisationUnits && ds.organisationUnits.length > 0 ){
                            for( var i=0; i< ds.organisationUnits.length; i++){
                                if ( ds.organisationUnits[i].id === ou.id ){
                                    if ( DataEntryUtils.userHasReadAccess(ds.id) ){
                                        dataSets.push(ds);
                                    }
                                    break;
                                }
                            }
                        }
                    });

                    dataSets = orderByFilter(dataSets, '-displayName').reverse();

                    if(dataSets.length === 0){
                        selectedDataSet = null;
                    }
                    else if(dataSets.length === 1){
                        selectedDataSet = dataSets[0];
                    }
                    else{
                        if(selectedDataSet){
                            var continueLoop = true;
                            for(var i=0; i<dataSets.length && continueLoop; i++){
                                if(dataSets[i].id === selectedDataSet.id){
                                    selectedDataSet = dataSets[i];
                                    continueLoop = false;
                                }
                            }
                            if(continueLoop){
                                selectedDataSet = null;
                            }
                        }
                    }

                    if(!selectedDataSet || angular.isUndefined(selectedDataSet) && dataSets.legth > 0){
                        selectedDataSet = dataSets[0];
                    }

                    $rootScope.$apply(function(){
                        def.resolve({dataSets: dataSets, selectedDataSet: selectedDataSet});
                    });
                });
            });
            return def.promise;
        },
        getByOuAndProperty: function(ou, selectedDataSet,propertyName,propertyValue){
            var def = $q.defer();

            StorageService.currentStore.open().done(function(){
                StorageService.currentStore.getAll('dataSets').done(function(dss){
                    var dataSets = [];
                    angular.forEach(dss, function(ds){
                        if(ds.id && ds.organisationUnits.hasOwnProperty( ou.id ) && DataEntryUtils.userHasWriteAccess(ds.id) && ds[propertyName] && ds[propertyName]===propertyValue){
                            dataSets.push(ds);
                        }
                    });

                    dataSets = orderByFilter(dataSets, '-displayName').reverse();

                    if(dataSets.length === 0){
                        selectedDataSet = null;
                    }
                    else if(dataSets.length === 1){
                        selectedDataSet = dataSets[0];
                    }
                    else{
                        if(selectedDataSet){
                            var continueLoop = true;
                            for(var i=0; i<dataSets.length && continueLoop; i++){
                                if(dataSets[i].id === selectedDataSet.id){
                                    selectedDataSet = dataSets[i];
                                    continueLoop = false;
                                }
                            }
                            if(continueLoop){
                                selectedDataSet = null;
                            }
                        }
                    }

                    if(!selectedDataSet || angular.isUndefined(selectedDataSet) && dataSets.legth > 0){
                        selectedDataSet = dataSets[0];
                    }

                    $rootScope.$apply(function(){
                        def.resolve({dataSets: dataSets, selectedDataSet: selectedDataSet});
                    });
                });
            });
            return def.promise;
        }
    };
})

/* Fetch periods */
.service('CustomPeriodService', function(CalendarService, DateUtils){

    this.getPeriods = function( opts ){
        var availablePeriods = [];
        if(!opts.periodType){
            return availablePeriods;
        }

        if( opts.dataSetType !== 'Plan_Setting' ){
            opts.futurePeriods = 1;
        }

        var calendarSetting = CalendarService.getSetting();

        dhis2.period.format = calendarSetting.keyDateFormat.toLowerCase();

        dhis2.period.calendar = $.calendars.instance( calendarSetting.keyCalendar );

        dhis2.period.generator = new dhis2.period.PeriodGenerator( dhis2.period.calendar, dhis2.period.format );

        dhis2.period.picker = new dhis2.period.DatePicker( dhis2.period.calendar, dhis2.period.format );

        var d2Periods = dhis2.period.generator.generateReversedPeriods( opts.periodType, opts.periodOffset );

        d2Periods = dhis2.period.generator.filterOpenPeriods( opts.periodType, d2Periods, opts.futurePeriods, null, null );

        d2Periods = d2Periods.map( function( p ){
            p.id = p.iso;
            return p;
        });

        var today = moment(DateUtils.getToday(),'YYYY-MM-DD');

        if ( opts.dataSetType === 'Routine' ||
                opts.dataSetType === 'Disease' ){
            d2Periods = d2Periods.filter( function( p ) {
                return today.diff(p.endDate, 'days') >= -9;
            });
        }

        return d2Periods;
    };

    this.getReportPeriods = function( opts ){
        var availablePeriods = [];
        if(!opts.periodType){
            return availablePeriods;
        }

        if( !opts.futurePeriods ){
            opts.futurePeriods = 1;
        }

        var calendarSetting = CalendarService.getSetting();

        dhis2.period.format = calendarSetting.keyDateFormat.toLowerCase();

        dhis2.period.calendar = $.calendars.instance( calendarSetting.keyCalendar );

        dhis2.period.generator = new dhis2.period.PeriodGenerator( dhis2.period.calendar, dhis2.period.format );

        dhis2.period.picker = new dhis2.period.DatePicker( dhis2.period.calendar, dhis2.period.format );

        var d2Periods = dhis2.period.generator.generateReversedPeriods( opts.periodType, opts.periodOffset );

        d2Periods = dhis2.period.generator.filterOpenPeriods( opts.periodType, d2Periods, opts.futurePeriods, null, null );

        d2Periods = d2Periods.map( function( p ){
            p.id = p.iso;
            return p;
        });

        return d2Periods;
    };
})

.service('DataValueService', function($q, $rootScope, $http, DataEntryUtils, StorageService) {

    return {
        saveDataValue: function( dv ){

            var url = '?de='+dv.de + '&ou='+dv.ou + '&pe='+dv.pe + '&co='+dv.co + '&value='+dv.value;

            if( dv.cc && dv.cp ) {
                url += '&cc='+dv.cc + '&cp='+dv.cp;
            }
            if( dv.comment ){
                url += '&comment=' + dv.comment;
            }
            if(dv.followUp || dv.followUp === false){
                url+='&followUp=' + dv.followUp;
            }
            var promise = $http.post(DHIS2URL + '/api/dataValues.json' + url).then(function(response){
                return response.data;
            }, function(){
                var dataValue = {
                    id: dv.de + '-' + dv.co + '-' + dv.ao + '-' + dv.pe + '-' + dv.ou,
                    dataElement: dv.de,
                    categoryOptionCombo: dv.co,
                    attributeOptionCombo: dv.ao,
                    period: dv.pe,
                    orgUnit: dv.ou,
                    value: dv.value,
                    deleted: dv.value === '' ? true : false
                };
                if(dv.comment){//save comment offline
                    dataValue.comment=dv.comment;
                }
                if(dv.followUp || dv.followUp === false){//save followup offline
                    dataValue.followUp=dv.followUp;
                }

                dhis2.lqas.store.set( 'dataValues', dataValue );
            });
            return promise;
        },
        getDataValue: function( dv ){
            var promise = $http.get(DHIS2URL + '/api/dataValues.json?de='+dv.de+'&ou='+dv.ou+'&pe='+dv.pe).then(function(response){
                return response.data;
            });
            return promise;
        },
        saveDataValueSet: function( dvs ){
            var promise = $http.post(DHIS2URL + '/api/dataValueSets.json', dvs ).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
            });
            return promise;
        },
        getDataValueSet: function( params ){
            var promise = $http.get(DHIS2URL + '/api/dataValueSets.json?' + params ).then(function(response){
                return response.data;
            }, function(){
                var def = $q.defer();
                StorageService.currentStore.open().done(function(){
                    StorageService.currentStore.getAll('dataValues').done(function(dvs){
                        var res = {dataValues: dvs || []};
                        $rootScope.$apply(function(){
                            def.resolve( res );
                        });
                    });
                });
                return def.promise;
            });
            return promise;
        }
    };
})

.service('CompletenessService', function($http, DataEntryUtils) {

    return {
        get: function( ds, ou, period, children ){
            var promise = $http.get(DHIS2URL + '/api/completeDataSetRegistrations.json?dataSet='+ds+'&orgUnit='+ou+'&period='+period+'&children='+children).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        },
        save: function( dsr ){
            var promise = $http.post(DHIS2URL + '/api/completeDataSetRegistrations.json', dsr ).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        },
        delete: function( ds, pe, ou, cc, cp, multiOu){
            var promise = $http.delete(DHIS2URL + '/api/completeDataSetRegistrations?ds='+ ds + '&pe=' + pe + '&ou=' + ou + '&cc=' + cc + '&cp=' + cp + '&multiOu=' + multiOu ).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        }
    };
})

.service('Analytics', function($q, $http, DataEntryUtils){
    return {
        getReport: function(ds, dimension, filter, dataSetType){

            var url = DHIS2URL + '/api/dataSetReport/raw?ds=' + ds + "&filter="+filter + "&" + dimension ;

            if( dataSetType === 'Disease' ){
                url = DHIS2URL + '/api/dataSetReport/disease?ds=' + ds + "&filter="+filter + "&" + dimension ;
            }

            var promise = $http.get( url ).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        },
        getDiseaseReport: function( url ){
            url = DHIS2URL + '/api/dataSetReport/diseaseTopList?' + url;
            var promise = $http.get( url ).then(function(response){
                return response.data;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        },
        getData: function( url ){
            url = DHIS2URL + '/api/analytics?' + url;
            var promise = $http.get( url ).then(function(response){
                var data = response.data;
                var reportData = [];
                if ( data && data.headers && data.headers.length > 0 && data.rows && data.rows.length > 0 ){
                    for(var i=0; i<data.rows.length; i++){
                        var r = {}, d = data.rows[i];
                        for(var j=0; j<data.headers.length; j++){

                            if ( data.headers[j].name === 'numerator' || data.headers[j].name === 'denominator' ){
                                d[j] = parseInt( d[j] );
                            }
                            else if( data.headers[j].name === 'value' ){
                                d[j] = parseFloat( d[j] );
                            }

                            r[data.headers[j].name] = d[j];
                        }

                        delete r.multiplier;
                        delete r.factor;
                        delete r.divisor;
                        reportData.push( r );
                    }
                }
                return reportData;
            }, function(response){
                DataEntryUtils.errorNotifier(response);
                return response.data;
            });
            return promise;
        }
    };
});