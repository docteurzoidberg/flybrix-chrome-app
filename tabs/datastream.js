(function() {
    'use strict';

    function rate_from_delay(delay) {
        if (delay > 1000) {
            return 0;
        }
        if (delay == 0) {
            return 1000;
        }
        return 1000 / delay;
    }

    var datastreamController = function($scope, $rootScope, $interval, filehandler, commandLog, serial) {
        $interval(function() {
            $scope.slowState = $rootScope.state;
            $scope.slowStateUpdateRate = $rootScope.stateUpdateRate;
            $scope.modelChangeMask = $rootScope.stateDataMask;
        }, 150);  // throttle redraw to 6-7Hz

        $scope.modelChangeMask = [];

        $scope.changeMask = function() {
            var mask = $scope.modelChangeMask.reduce(function(acc, val, idx) {
                return acc + (val ? (1 << idx) : 0);
            });
            var bytes = [mask % 0x100, (mask >> 8) % 0x100, (mask >> 16) % 0x100, (mask >> 24) % 0x100];  // little endian
            console.log(bytes);
            serial.send(serial.field.COM_SET_STATE_MASK, new Uint8Array(bytes));
        };

        $rootScope.$watch('targetDelay', function(value) {
            if (value === undefined)
                return;
            $scope.targetRate = rate_from_delay(value);
            var bytes = [value % 256, value / 256];  // little endian
            serial.send(serial.field.COM_SET_STATE_DELAY, new Uint8Array(bytes));
        });

        var chosenEntry = null;
        var accumulatedBlob = new Blob();
        var lastBlobWrite = new Date();
        var capturing = false;

        var captureModeCallback = function(data) {
            var currentTime = new Date();
            accumulatedBlob = new Blob([accumulatedBlob, data]);
            if (currentTime - lastBlobWrite < 5000)
                return;
            lastBlobWrite = currentTime;
            filehandler.writeData(chosenEntry, accumulatedBlob);
        };

        $scope.captureModeFilehandler = {
            start: function(entry) {
                if (serial.getDataHandler() === captureModeCallback)
                    return;
                commandLog('Changing to capture mode.');
                if (chosenEntry !== entry) {
                    chosenEntry = entry;
                    accumulatedBlob = new Blob();
                }
                serial.setDataHandler(captureModeCallback);
            },
            stop: function(entry) {
                if (serial.getDataHandler() !== captureModeCallback)
                    return;
                commandLog('Closing capture mode and returning to previous mode.');
                filehandler.writeData(chosenEntry, accumulatedBlob);
                serial.setDataHandler(null);
            },
        };

        $scope.setSDLog = function(val) {
            serial.send(serial.field.COM_SET_CARD_RECORDING, new Uint8Array([val]), false);
        }
    };

    angular.module('flybrixApp').controller('datastreamController', ['$scope', '$rootScope', '$interval', 'filehandler', 'commandLog', 'serial', datastreamController]);
}());
