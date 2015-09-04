Exfil
===
:warning: **NOT READY FOR PRODUCTION YET**

>EXFIL (also exfiltration or Extraction), in tactical combat and special operations use, is the process of removing constituents from a targeted site when it is considered imperative that they be immediately relocated out of a hostile environment and taken to a secured area under friendly control.
>
>*Source:* http://www.urbandictionary.com/define.php?term=Exfil


## Principle

Watch all Auto Scaling Group instances by calling their health check URL and detach them before they get killed :)

## Use case?

You want to perform a post mortem on instances that get killed with no apparent reason...

## Getting started

1. Clone this repo
2. `npm install`
3.  Create a `config/local.yml` file to override the defaults
~~~yaml
# AWS Region
region: eu-west-1
# Prefix of your Auto Scaling Group
asgPrefix: dev1-av-ui
# 2 failing checks will trigger an exfiltration
threshold: 2
# Check interval
interval: 2000
# Webapp port
port: 8080
# Guess what...
checkUrl: /check/app
~~~
4. `npm start`



