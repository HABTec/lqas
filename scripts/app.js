import './lqasModule';

// common files
import '../common/dhis2.metadata.js';
import '../common/dhis2.angular.services.js';
import '../common/dhis2.angular.directives.js';
import '../common/dhis2.angular.validations.js';
import '../common/dhis2.angular.filters.js';
import '../common/dhis2.angular.controllers.js';
import '../common/angular-translate.min.js';


// App files
import '../scripts/services.js';
import '../scripts/filters.js';
import '../scripts/directives.js';
import '../scripts/controllers.js';
import '../scripts/leftbar-menu-controller.js';

import '../components/data-accuracy/data-accuracy-controller.js'

let scriptElement = document.createElement("script");
scriptElement.type = "text/javascript";
scriptElement.src = env.dhisConfig.apiRoot + "/api/files/script";
document.body.appendChild(scriptElement);

let cssElement = document.createElement("css");
cssElement.type = "text/css";
cssElement.src = env.dhisConfig.apiRoot + "/api/files/style";
document.body.appendChild(cssElement);

jQuery(function () {
    Dhis2HeaderBar.initHeaderBar(document.querySelector('#header'), env.dhisConfig.apiRoot + '/api', { noLoadingIndicator: true });
});

/* App Module */
angular.module('lqas')

.value('DHIS2URL', env.dhisConfig.apiRoot)

.config(function($httpProvider, $routeProvider, $translateProvider, $logProvider) {

    $httpProvider.defaults.useXDomain = true;
    delete $httpProvider.defaults.headers.common['X-Requested-With'];

    $routeProvider.when('/dataAccuracy', {
        templateUrl:'components/data-accuracy/home.html',
        controller: 'dataAccuracyCheckController'
    }).otherwise({
        redirectTo : '/dataAccuracy'
    });

    $translateProvider.preferredLanguage('en');
    $translateProvider.useSanitizeValueStrategy('escaped');
    $translateProvider.useLoader('i18nLoader');

    $logProvider.debugEnabled(false);

})

.run(function($templateCache, $http, $rootScope){
    
    $rootScope.maxOptionSize = 100;
});
