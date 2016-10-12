var AWS = require("aws-sdk");
var Bromise = require("bluebird");
var conzole = require("conzole");
var config = require("config");
var got = require("got");
var _ = require("lodash");

//------------------ VARIABLES ------------------//
var region = {
    region: config.region
};
var AUTOSCALING_GROUP_PREFIX = config.asgPrefix;

var ec2 = new AWS.EC2(region);
Bromise.promisifyAll(Object.getPrototypeOf(ec2));
var asg = new AWS.AutoScaling(region);
Bromise.promisifyAll(Object.getPrototypeOf(asg));

var nbChecks = {};
var threshold = config.threshold;
var autoscalingGroup;
var exfiledInstances = [];

//------------------ LOGIC ------------------//

function getInstancesToWatch() {
    // Get all AutoScalingGroup instances, keep the healthy ones
    var healthyInstances = _.filter(autoscalingGroup.Instances, function(instance) {
        return instance.LifecycleState === "InService";
    });

    conzole.indent(4).quote("Monitor instances:", _.map(healthyInstances, "InstanceId"));

    // Get more details on the healthy instances
    return ec2.describeInstancesAsync({
            InstanceIds: _.map(healthyInstances, "InstanceId")
        })
        .then(function(instancesDescriptions) {
            // Clean the result
            var instances = _.map(instancesDescriptions.Reservations, "Instances");
            return _.flatten(instances);
        });
}

function watchInstances(instances) {
    var statuses = _.map(instances, function(instance) {
        return watchInstance(instance);
    });

    return Bromise.all(statuses)
        .then(function(instances) {
            return _.compact(instances);
        });
}

function watchInstance(instance) {
    var ip = instance.PrivateIpAddress;
    // First check for this IP ?
    if (!nbChecks[ip]) {
        nbChecks[ip] = 0;
    }

    var checkUrl = "http://" + ip + ":" + config.port + config.checkUrl;
    return got(checkUrl)
        .then(function(res) {
            conzole.start("Check \"" + checkUrl + "\"");
            if (res.statusCode !== 200) {
                return handleKOStatus(instance);
            } else {
                // App is back, reset counter
                conzole.indent().done(res.statusCode);
                nbChecks[ip] = 0;
            }
        })
        .catch(function(e) {
            conzole.start("Check \"" + checkUrl + "\"");
            return handleKOStatus(instance);
        });
}

function handleKOStatus(instance) {
    var ip = instance.PrivateIpAddress;
    nbChecks[ip]++;
    conzole.warn("Status is not OK - #" + nbChecks[ip]);
    if (nbChecks[ip] > threshold) {
        conzole.warn("Need to exfil instance \"" + ip + "\"");
        return instance;
    }
    return null;
}

function exfilInstances(instances) {
    if (instances.length > 0) {
        var ids = _.map(instances, "InstanceId");
        if (exfiledInstances.length > 0) {
            // exclude already exfiled instance that may still be attached to the ELB
            ids = _.intersection(ids, exfiledInstances);
        }

        // It may result in no exfil at all :)
        if (ids.length === 0) {
            return;
        }

        if (config.dryRun) {
            conzole.warn("DryRun - Would exfil instances:", ids);
            return;
        }

        conzole.start("Exfil instances:", ids);
        return asg.detachInstancesAsync({
                AutoScalingGroupName: autoscalingGroup.AutoScalingGroupName,
                InstanceIds: ids,
                ShouldDecrementDesiredCapacity: false
            })
            .then(function() {
                exfiledInstances.concat(ids);
            });
    }
}

function getAutoScalingGroup() {
    conzole.start("Get Auto Scaling Group with prefix:", AUTOSCALING_GROUP_PREFIX);
    return asg.describeAutoScalingGroupsAsync()
        .then(function(res) {
            autoscalingGroup = _.filter(res.AutoScalingGroups, function(asgroup) {
                return asgroup.AutoScalingGroupName.indexOf(AUTOSCALING_GROUP_PREFIX) !== -1;
            })[0];
            conzole.done("Found:", autoscalingGroup.AutoScalingGroupName);
        });
}


//------------------ MAIN ------------------//

function main() {
    conzole.title("Watch instances");
    return getAutoScalingGroup()
        .then(getInstancesToWatch)
        .then(watchInstances)
        .then(exfilInstances)
        .then(conzole.ln)
        .catch(function(e) {
            conzole.failed("ERRRR:", e);
        });
}

main()
    .then(function() {
        setInterval(main, config.interval);
    });
