//Controller for column show/hide
var lqas = angular.module('lqas');

lqas.controller('LeftBarMenuController',
        function($scope,
                $location) {
    $scope.showDataAccuracyCheck = function(){
        $location.path('/dataAccuracyCheck').search();
    };
});