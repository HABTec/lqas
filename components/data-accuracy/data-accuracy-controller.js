/* global angular */

'use strict';

var lqas = angular.module('lqas');

//Controller for settings page
lqas.controller('dataAccuracyCheckController', function ($rootScope, $scope, $translate, $filter,
        DataSetFactory,
        MetaDataFactory,
        DataEntryUtils,
        PeriodService,
        ModalService,
        CustomPeriodService,
        DataValueService) {
    $scope.periodOffset = 0;
    $scope.maxOptionSize = 30;
    $scope.model = {
        dataSets: [],
        reportColumn: 'PERIOD',
        categoryCombos: [],
        filterGroups: [],
        categoryOptionGroupSets: {},
        showDiseaseGroup: false,
        periods: [],
        selectedPeriods: [],
        includeChildren: false,
        periodTypes: [],
        columns: [],
        reportReady: false,
        reportStarted: false,
        showReportFilters: true,
        showDiseaseFilters: true,
        filterCompleteness: false,
        selectedPeriodType: null,
        selectedDataElements: [],
        metaDataLoaded: false,
        valueExists: false,
        sortHeader: null,
        contentCoverage: 0,
        accuracyMatch: 0,
        accuracyRate: {
            template: {
                1: '20-25 %',
                2: '30-25 %',
                3: '40%',
                4: '45%',
                5: '55%',
                6: '60%',
                7: '65-70%',
                8: '75-80%',
                9: '90%',
                11: '95%',
                12: '100%'
            }
        }
    };

    var resetParams = function(){
        $scope.model.accuracyMatch = 0;
        $scope.model.reportReady = false;
    };

    $rootScope.DHIS2URL = env.dhisConfig.apiRoot;
    downloadMetaData( env.dhisConfig.apiRoot ).then(function(){
        console.log('Finished loading meta-data');
        $scope.model.optionSets = [];
        $scope.model.booleanValues = [{displayName: $translate.instant('yes'), value: true}, {displayName: $translate.instant('no'), value: false}];
        MetaDataFactory.getAll('optionSets').then(function (opts) {
            angular.forEach(opts, function (op) {
                $scope.model.optionSets[op.id] = op;
            });

            MetaDataFactory.getAll('categoryCombos').then(function (ccs) {
                angular.forEach(ccs, function (cc) {
                    $scope.model.categoryCombos[cc.id] = cc;
                });
                selectionTreeSelection.setMultipleSelectionAllowed(false);
                selectionTree.clearSelectedOrganisationUnitsAndBuildTree();

                $scope.model.metaDataLoaded = true;
                $scope.pleaseSelectLabel = $translate.instant('please_select');
            });
        });
    });

    //watch for selection of org unit from tree
    $scope.$watch('selectedOrgUnits', function () {
        $scope.model.dataSets = [];
        $scope.selectedOrgUnit = null;
        $scope.model.selectedDataElements = [];
        resetParams();
        if (angular.isObject($scope.selectedOrgUnits)) {
            $scope.selectedOrgUnit = $scope.selectedOrgUnits[0];
            $scope.loadDataSets($scope.selectedOrgUnit);
        }
    });

    //load datasets associated with the selected org unit.
    $scope.loadDataSets = function (orgUnit) {
        $scope.selectedOrgUnit = orgUnit;
        $scope.model.dataSets = [];
        $scope.model.selectedAttributeCategoryCombo = null;
        $scope.model.selectedAttributeOptionCombos = {};
        $scope.model.selectedAttributeOptionCombo = null;
        $scope.model.selectedPeriod = null;
        resetParams();
        if (angular.isObject($scope.selectedOrgUnit)) {
            DataSetFactory.getByOu($scope.selectedOrgUnit, $scope.model.selectedDataSet).then(function (response) {
                $scope.model.dataSets = response.dataSets || [];
                $scope.model.dataSetLoaded = true;
            });
        }
    };

    //watch for selection of data set
    $scope.$watch('model.selectedDataSet', function () {
        $scope.model.periods = [];
        $scope.model.selectedPeriod = null;
        $scope.model.categoryOptionsReady = false;
        resetCategoryOptions();
        resetParams();
        if (angular.isObject($scope.model.selectedDataSet) && $scope.model.selectedDataSet.id) {
            $scope.loadDataSetDetails();
        }
    });

    $scope.$watch('model.selectedPeriod', function () {
        $scope.generateRandomDataElements();
    });

    $scope.getPeriods = function(mode){
        if( $scope.model.selectedPeriodType ){
            var opts = {
                periodType: $scope.model.selectedPeriodType,
                periodOffset: mode === 'NXT' ? ++$scope.periodOffset: --$scope.periodOffset,
                futurePeriods: 1
            };
            $scope.model.periods = CustomPeriodService.getReportPeriods( opts );
        }
    };

    function fetchRandomDataElements() {

        if (!$scope.model.entryItems || $scope.model.entryItems.length < 0) {
            return;
        }
        var items = angular.copy(Object.values($scope.model.entryItems));
        if (items.length <= 12) {
            return items;
        }

        var _items = [...items].sort(() => 0.5 - Math.random());

        return _items.slice(0, 12);
    }

    $scope.loadDataSetDetails = function () {
        if ($scope.model.selectedDataSet && $scope.model.selectedDataSet.id && $scope.model.selectedDataSet.periodType) {

            $scope.model.selectedPeriodType = $scope.model.selectedDataSet.periodType;

            var opts = {
                periodType: $scope.model.selectedDataSet.periodType,
                periodOffset: $scope.periodOffset,
                futurePeriods: $scope.model.selectedDataSet.openFuturePeriods,
                dataSetType: $scope.model.selectedDataSet.DataSetCategory
            };

            $scope.model.periods = PeriodService.getPeriods(opts);

            if (!$scope.model.selectedDataSet.dataElements || $scope.model.selectedDataSet.dataElements.length < 1) {
                DataEntryUtils.notify('error', 'missing_data_elements_indicators');
                return;
            }

            $scope.model.selectedAttributeCategoryCombo = null;
            if ($scope.model.selectedDataSet && $scope.model.selectedDataSet.categoryCombo && $scope.model.selectedDataSet.categoryCombo.id) {

                $scope.model.selectedAttributeCategoryCombo = $scope.model.categoryCombos[$scope.model.selectedDataSet.categoryCombo.id];
                if ($scope.model.selectedAttributeCategoryCombo && $scope.model.selectedAttributeCategoryCombo.isDefault) {
                    $scope.model.categoryOptionsReady = true;
                    $scope.model.selectedOptions = $scope.model.selectedAttributeCategoryCombo.categories[0].categoryOptions;
                }
                angular.forEach($scope.model.selectedAttributeCategoryCombo.categoryOptionCombos, function (oco) {
                    $scope.model.selectedAttributeOptionCombos['"' + oco.displayName + '"'] = oco.id;
                });
            }

            $scope.model.entryItems = [];
            $scope.model.dataElements = [];
            var index = 0;
            angular.forEach($scope.model.selectedDataSet.dataElements, function (de) {
                $scope.model.dataElements[de.id] = de;
                angular.forEach($scope.model.categoryCombos[de.categoryCombo.id].categoryOptionCombos, function (oco) {
                    $scope.model.entryItems[de.id + '.' + oco.id] = {
                        dataElement: de,
                        optionCombo: oco,
                        index: ++index
                    };
                });
            });

            if ($scope.model.selectedDataSet.sections.length > 0) {
                $scope.model.entryItems = [];
                var index = 0;
                angular.forEach($scope.model.selectedDataSet.sections, function (section) {

                    angular.forEach(section.dataElements, function (de) {

                        var dataElement = $scope.model.dataElements[de.id];

                        if (dataElement && dataElement.categoryCombo) {
                            angular.forEach($scope.model.categoryCombos[dataElement.categoryCombo.id].categoryOptionCombos, function (oco) {
                                if (!section.greyedFields || section.greyedFields.length === 0 || section.greyedFields.indexOf(de.id + '.' + oco.id) === -1) {
                                    $scope.model.entryItems[de.id + '.' + oco.id] = {
                                        dataElement: dataElement,
                                        optionCombo: oco,
                                        index: ++index
                                    };
                                }
                            });
                        }
                    });
                });
            }
        }
    };

    $scope.generateRandomDataElements = function () {
        resetParams();
        $scope.model.selectedDataElements = fetchRandomDataElements();
        $scope.dataValues = {};
        angular.forEach($scope.model.selectedDataElements, function (de) {
            $scope.dataValues[de.dataElement.id + '.' + de.optionCombo.id] = {};
        });
    };
    
    var resetCategoryOptions = function(){
        if ( $scope.model.selectedAttributeCategoryCombo && $scope.model.selectedAttributeCategoryCombo.id )
        {
            angular.forEach($scope.model.selectedAttributeCategoryCombo.categories, function(ca){
                delete ca.selectedOption;
            });
        }
        $scope.model.categoryOptionsReady = false;
    };
    
    function checkOptions(){
        resetParams();
        for(var i=0; i<$scope.model.selectedAttributeCategoryCombo.categories.length; i++){
            if($scope.model.selectedAttributeCategoryCombo.categories[i].selectedOption && $scope.model.selectedAttributeCategoryCombo.categories[i].selectedOption.id){
                $scope.model.categoryOptionsReady = true;
                $scope.model.selectedOptions.push($scope.model.selectedAttributeCategoryCombo.categories[i].selectedOption);
            }
            else{
                $scope.model.categoryOptionsReady = false;
                break;
            }
        }
        if($scope.model.categoryOptionsReady){
            $scope.fetchData();
        }
    };

    $scope.getCategoryOptions = function(){
        $scope.model.categoryOptionsReady = false;
        $scope.model.selectedOptions = [];
        checkOptions();
    };
    
    $scope.fetchData = function () {

        if (!$scope.selectedOrgUnit || !$scope.selectedOrgUnit.id) {
            DataEntryUtils.notify('error', 'please_select_orgunit');
            return;
        }

        if (!$scope.model.selectedDataSet || !$scope.model.selectedDataSet.id) {
            DataEntryUtils.notify('error', 'please_select_dataset');
            return;
        }

        if (!$scope.model.selectedPeriod) {
            DataEntryUtils.notify('error', 'please_select_period');
            return;
        }

        if (!$scope.model.selectedDataElements || $scope.model.selectedDataElements.length < 1) {
            DataEntryUtils.notify('error', 'invalid_sample_size');
            return;
        }
        var incompleteRegister = false;
        for( var i=0; i<$scope.model.selectedDataElements.length; i++){
            var de = $scope.model.selectedDataElements[i];
            if ( !$scope.dataValues[de.dataElement.id + '.' + de.optionCombo.id] || (!$scope.dataValues[de.dataElement.id + '.' + de.optionCombo.id].register && $scope.dataValues[de.dataElement.id + '.' + de.optionCombo.id].register !== 0) ){
                incompleteRegister = true;
                break;
            }
        }

        var modalOptions = {
            closeButtonText: 'no',
            actionButtonText: 'yes',
            headerText: 'warning',
            bodyText: incompleteRegister ? 'incomplete_register_value_are_you_sure_continue_accuracy_check' : 'are_you_sure_continue_accuracy_check'
        };

        ModalService.showModal({}, modalOptions).then(function(result){

            var dataValueSetUrl = 'dataSet=' + $scope.model.selectedDataSet.id + '&period=' + $scope.model.selectedPeriod.id;

            dataValueSetUrl += '&orgUnit=' + $scope.selectedOrgUnit.id;

            $scope.model.selectedAttributeOptionCombo = DataEntryUtils.getOptionComboIdFromOptionNames($scope.model.selectedAttributeOptionCombos, $scope.model.selectedOptions);

            $scope.model.reportStarted = true;
            $scope.model.reportReady = false;

            //fetch data values...
            DataValueService.getDataValueSet(dataValueSetUrl).then(function (response) {
                $scope.model.reportStarted = false;
                $scope.model.reportReady = true;
                $scope.model.accuracyMatch = 0;
                if (response && response.dataValues && response.dataValues.length > 0) {
                    response.dataValues = $filter('filter')(response.dataValues, {attributeOptionCombo: $scope.model.selectedAttributeOptionCombo});
                    if (response.dataValues.length > 0) {
                        angular.forEach(response.dataValues, function (dv) {
                            if ($scope.dataValues[dv.dataElement + '.' + dv.categoryOptionCombo]) {
                                dv.value = DataEntryUtils.formatDataValue($scope.model.dataElements[dv.dataElement], dv.value, $scope.model.optionSets, 'USER');
                                $scope.dataValues[dv.dataElement + '.' + dv.categoryOptionCombo].report = dv.value;
                            }
                        });
                    }
                } else {
                    DataEntryUtils.notify('info', 'no_value_exists');
                }                

                angular.forEach($scope.model.selectedDataElements, function (de) {
                    var key = de.dataElement.id + '.' + de.optionCombo.id;
                    if ( $scope.dataValues[key].register === $scope.dataValues[key].report ){
                        $scope.model.accuracyMatch++;
                    }
                });
            });
        });
    };

    $scope.exportData = function () {
        var blob = new Blob([document.getElementById('exportTable').innerHTML], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8"
        });
        saveAs(blob, $scope.model.reportName + '.xls');
    };
});