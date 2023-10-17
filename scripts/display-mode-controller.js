//Controller for column show/hide
var lqas = angular.module('lqas');
lqas.controller('DisplayModeController',
        function($scope, $modalInstance) {
    
    $scope.close = function () {
      $modalInstance.close($scope.gridColumns);
    };
});