/* global dhis2, angular, selection, i18n_ajax_login_failed, _ */


dhis2.util.namespace('dhis2.lqas');
dhis2.util.namespace('dhis2.rd');

// whether current user has any organisation units
dhis2.lqas.emptyOrganisationUnits = false;

dhis2.util.namespace('cachecleaner');

cachecleaner.clean = function(){
    indexedDB.deleteDatabase("dhis2cr");
    indexedDB.deleteDatabase("dhis2ou");
    localStorage.clear();
    sessionStorage.clear();
    return "cache cleaned";
}

var i18n_no_orgunits = 'No organisation unit attached to current user, no data entry possible';
var i18n_offline_notification = 'You are offline';
var i18n_online_notification = 'You are online';
var i18n_ajax_login_failed = 'Login failed, check your username and password and try again';

var DHIS2URL = '..';

var optionSetsInPromise = [];
var attributesInPromise = [];
var batchSize = 50;

dhis2.lqas.store = null;
dhis2.rd.metaDataCached = dhis2.rd.metaDataCached || false;
dhis2.lqas.memoryOnly = $('html').hasClass('ie7') || $('html').hasClass('ie8');
var adapters = [];
if( dhis2.lqas.memoryOnly ) {
    adapters = [ dhis2.storage.InMemoryAdapter ];
} else {
    adapters = [ dhis2.storage.IndexedDBAdapter, dhis2.storage.DomLocalStorageAdapter, dhis2.storage.InMemoryAdapter ];
}

dhis2.lqas.store = new dhis2.storage.Store({
    name: 'dhis2cr',
    adapters: [dhis2.storage.IndexedDBAdapter, dhis2.storage.DomSessionStorageAdapter, dhis2.storage.InMemoryAdapter],
    objectStores: ['dataSets', 'periodTypes', 'categoryCombos', 'dataElementGroups', 'categoryOptionGroupSets', 'organisationUnitGroupSets','optionSets']
});

(function($) {
    $.safeEach = function(arr, fn)
    {
        if (arr)
        {
            $.each(arr, fn);
        }
    };
})(jQuery);

/**
 * Page init. The order of events is:
 *
 * 1. Load ouwt
 * 2. Load meta-data (and notify ouwt)
 *
 */
$(document).ready(function()
{
    $.ajaxSetup({
        type: 'POST',
        cache: false
    });

    $('#loaderSpan').show();
});

$(document).bind('dhis2.online', function(event, loggedIn)
{
    if (loggedIn)
    {
        var OfflineDataValueService = angular.element('body').injector().get('OfflineDataValueService');

        OfflineDataValueService.hasLocalData().then(function(localData){
            if(localData){
                var message = i18n_need_to_sync_notification + ' <button id="sync_button" type="button">' + i18n_sync_now + '</button>';

                setHeaderMessage(message);

                $('#sync_button').bind('click', uploadLocalData);
            }
            else{
                if (dhis2.lqas.emptyOrganisationUnits) {
                    setHeaderMessage(i18n_no_orgunits);
                }
                else {
                    setHeaderDelayMessage(i18n_online_notification);
                }
            }
        });


        if (dhis2.lqas.emptyOrganisationUnits) {
            setHeaderMessage(i18n_no_orgunits);
        }
        else {
            setHeaderDelayMessage(i18n_online_notification);
        }
    }
    else
    {
        var form = [
            '<form style="display:inline;">',
            '<label for="username">Username</label>',
            '<input name="username" id="username" type="text" style="width: 70px; margin-left: 10px; margin-right: 10px" size="10"/>',
            '<label for="password">Password</label>',
            '<input name="password" id="password" type="password" style="width: 70px; margin-left: 10px; margin-right: 10px" size="10"/>',
            '<button id="login_button" type="button">Login</button>',
            '</form>'
        ].join('');

        setHeaderMessage(form);
        ajax_login();
    }
});

$(document).bind('dhis2.offline', function()
{
    if (dhis2.lqas.emptyOrganisationUnits) {
        setHeaderMessage(i18n_no_orgunits);
    }
    else {
        setHeaderMessage(i18n_offline_notification);
    }
});

function ajax_login()
{
    $('#login_button').bind('click', function()
    {
        var username = $('#username').val();
        var password = $('#password').val();

        $.post('../dhis-web-commons-security/login.action', {
            'j_username': username,
            'j_password': password
        }).success(function()
        {
            var ret = dhis2.availability.syncCheckAvailability();

            if (!ret)
            {
                alert(i18n_ajax_login_failed);
            }
        });
    });
}

// -----------------------------------------------------------------------------
// Metadata downloading
// -----------------------------------------------------------------------------

function downloadMetaData( url )
{
    DHIS2URL = url;

    console.log('Loading required meta-data');

    return dhis2.lqas.store.open()
        .then( getUserAccessibleDataSet )
        .then( getSystemSetting )
        .then( getPeriodTypes )

        .then( getMetaCategoryCombos )
        .then( filterMissingCategoryCombos )
        .then( getCategoryCombos )

        .then( getMetaDataElementGroups )
        .then( filterMissingDataElementGroups )
        .then( getDataElementGroups )

        .then( getMetaDataSets )
        .then( filterMissingDataSets )
        .then( getDataSets )

        .then( getMetaCategoryOptionGroupSets )
        .then( filterMissingCategoryOptionGroupSets )
        .then( getCategoryOptionGroupSets )

        .then( getMetaOrganisationUnitGroupSets )
        .then( filterMissingOrganisationUnitGroupSets )
        .then( getOrganisationUnitGroupSets )

        //Option Sets are added to contain the labels in the dataSet report.
        .then( getMetaOptionSets)
        .then( filterMissingOptionSets)
        .then( getOptionSets);

}

function getUserAccessibleDataSet(){
    return dhis2.metadata.getMetaObject(null, 'ACCESSIBLE_DATASETS', DHIS2URL + '/api/dataSets.json', 'fields=id,access[data[read,write]]&paging=false', 'sessionStorage', dhis2.lqas.store);
}

function getSystemSetting(){
    if(localStorage['SYSTEM_SETTING']){
       return;
    }
    return dhis2.metadata.getMetaObject(null, 'SYSTEM_SETTING', DHIS2URL + '/api/systemSettings', 'key=keyGoogleMapsApiKey&key=keyMapzenSearchApiKey&key=keyCalendar&key=keyDateFormat&key=multiOrganisationUnitForms', 'sessionStorage', dhis2.lqas.store);
}

function getPeriodTypes(){
    return dhis2.metadata.getMetaObjects('periodTypes', 'periodTypes', DHIS2URL + '/api/periodTypes', 'fields=name,frequencyOrder', 'idb', dhis2.lqas.store);
}

function getMetaCategoryCombos(){
    return dhis2.metadata.getMetaObjectIds('categoryCombos', DHIS2URL + '/api/categoryCombos.json', 'paging=false&fields=id,version');
}

function filterMissingCategoryCombos( objs ){
    return dhis2.metadata.filterMissingObjIds('categoryCombos', dhis2.lqas.store, objs);
}

function getCategoryCombos( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'categoryCombos', 'categoryCombos', DHIS2URL + '/api/categoryCombos.json', 'paging=false&fields=id,displayName,code,skipTotal,isDefault,categoryOptionCombos[id,displayName],categories[id,displayName,code,attributeValues[value,attribute[id,name,valueType,code]],categoryOptions[id,displayName,code]]', 'idb', dhis2.lqas.store);
}

function getMetaDataElementGroups(){
    return dhis2.metadata.getMetaObjectIds('dataElementGroups', DHIS2URL + '/api/dataElementGroups.json', 'paging=false&fields=id,version');
}

function filterMissingDataElementGroups( objs ){
    return dhis2.metadata.filterMissingObjIds('dataElementGroups', dhis2.lqas.store, objs);
}

function getDataElementGroups( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'dataElementGroups', 'dataElementGroups', DHIS2URL + '/api/dataElementGroups.json', 'paging=false&fields=id,displayName,code,dataElements,attributeValues[value,attribute[id,name,valueType,code]] ','idb', dhis2.lqas.store, dhis2.metadata.processObject);
}

function getMetaDataSets(){
    return dhis2.metadata.getMetaObjectIds('dataSets', DHIS2URL + '/api/dataSets.json', 'paging=false&fields=id,version');
}

function filterMissingDataSets( objs ){
    return dhis2.metadata.filterMissingObjIds('dataSets', dhis2.lqas.store, objs);
}

function getDataSets( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'dataSets', 'dataSets', DHIS2URL + '/api/dataSets.json', 'paging=false&fields=id,displayName,version,periodType,timelyDays,expiryDays,categoryCombo[id],organisationUnits[id,name,path],attributeValues[value,attribute[id,name,valueType,code]],sections[id,displayName,description,sortOrder,code,dataElements,greyedFields[dimensionItem],indicators[id,displayName,indicatorType,numerator,denominator,attributeValues[value,attribute[id,name,valueType,code]]]],dataSetElements[id,dataElement[id,code,displayFormName,description,attributeValues[value,attribute[id,name,valueType,code]],description,optionSetValue,optionSet[id],valueType,categoryCombo[id]]]', 'idb', dhis2.lqas.store);
}

function getMetaCategoryOptionGroupSets(){
    return dhis2.metadata.getMetaObjectIds('categoryOptionGroupSets', DHIS2URL + '/api/categoryOptionGroupSets.json', 'paging=false&fields=id,version');
}

function filterMissingCategoryOptionGroupSets( objs ){
    return dhis2.metadata.filterMissingObjIds('categoryOptionGroupSets', dhis2.lqas.store, objs);
}

function getCategoryOptionGroupSets( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'categoryOptionGroupSets', 'categoryOptionGroupSets', DHIS2URL + '/api/categoryOptionGroupSets.json', 'paging=false&fields=id,displayName,version,attributeValues[value,attribute[id,name,valueType,code]],categoryOptionGroups[id,displayName,categoryOptions[id,displayName]]', 'idb', dhis2.lqas.store, dhis2.metadata.processObject);
}

function getMetaOrganisationUnitGroupSets(){
    return dhis2.metadata.getMetaObjectIds('organisationUnitGroupSets', DHIS2URL + '/api/organisationUnitGroupSets.json', 'paging=false&fields=id,version');
}

function filterMissingOrganisationUnitGroupSets( objs ){
    return dhis2.metadata.filterMissingObjIds('organisationUnitGroupSets', dhis2.lqas.store, objs);
}

function getOrganisationUnitGroupSets( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'organisationUnitGroupSets', 'organisationUnitGroupSets', DHIS2URL + '/api/organisationUnitGroupSets.json', 'paging=false&fields=id,displayName,version,organisationUnitGroups[id,displayName]', 'idb', dhis2.lqas.store, dhis2.metadata.processObject);
}

function getMetaOptionSets(){
    return dhis2.metadata.getMetaObjectIds('optionSets', DHIS2URL + '/api/optionSets.json', 'paging=false&fields=id,version');
}

function filterMissingOptionSets( objs ){
    return dhis2.metadata.filterMissingObjIds('optionSets', dhis2.lqas.store, objs);
}

function getOptionSets( ids ){
    return dhis2.metadata.getBatches( ids, batchSize, 'optionSets', 'optionSets', DHIS2URL + '/api/optionSets.json', 'paging=false&fields=id,displayName,version,valueType,attributeValues[value,attribute[id,name,valueType,code]],options[id,displayName,code]', 'idb', dhis2.lqas.store, dhis2.metadata.processObject);
}