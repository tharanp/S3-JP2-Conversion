// dependencies
var AWS = require('aws-sdk');
var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;
var childproc= require('child_process');
var async = require('async');
var tmpdir = '/tmp/';
var s3 = new AWS.S3();
var srcFileExt = null;
exports.handler = function (event, context, callback) {
	// Read options from the event.
	console.log(JSON.stringify(event));
	var srcBucket = event.Records[0].s3.bucket.name;
	var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
	var dstBucket = srcBucket + "-output";
	var srcFileExt = srcKey.substr(srcKey.lastIndexOf('.') + 1);
	var srcFileKey = srcKey.substr(0, srcKey.lastIndexOf('.'));
	var srcBaseName = path.basename(srcKey);
	var dstKey = srcFileKey.toLowerCase().replace(/\s/g, '').replace(/\+/g, '') + ".jp2";
	var inputfile = srcKey.replace(/\ /g, '_');
	inputfile = tmpdir + inputfile.replace(/\//g, '_');
	var tempDest = srcFileKey.replace(/\ /g, '_');
	tempDest = tmpdir + srcFileKey.replace(/\//g, '_') + ".jp2";
	var local_stored_file_path = "/tmp/" + srcBaseName;
	var validImageTypes = ['PNG','png', 'tif', 'tiff', 'TIF', 'TIFF','jpg','jpeg','JPG','JPEG','gif','GIF'];
	if (validImageTypes.indexOf(srcFileExt) < 0) {		
		context.callbackWaitsForEmptyEventLoop = false;
		context.fail(new Error("Image extension does not match"));
		callback(null, {
			status: false,
			message: 'Image extension does not match.'
		});
	}
	console.log('getting object');
	async.waterfall([function (wcallback) {
		exec('rm -rf ' + tmpdir + "*", function (error, stdout, stderr) { });
		s3.getObject({
			Bucket: srcBucket,
			Key: srcKey
		}, function (err, data) {
			if (err) {
				console.log('unable to download file.' + srcBucket + " key: " + srcKey);
				console.log(err);
				context.callbackWaitsForEmptyEventLoop = false;
				wcallback(err);
			} else {
				console.log('Conversion Image Starting... file name', inputfile);
				fs.writeFile(inputfile, data.Body, function (err) {
					if (err) {
						console.log(err.code, "-", err.message);
						wcallback(err);
					}
					else {
						var exists = fs.existsSync(inputfile);
						console.log("dpwnloaded file exist? ", exists);
						wcallback(null);
					}
				});

			}
		});
	}, function (wcallback) {
		console.log("image coversion started",tempDest);
		var file = fs.createWriteStream(tempDest, {encoding: 'binary'});		
		var child = childproc.spawn('convert', ["-limit","memory","6800MiB","-limit","map", "10000MiB","-quality","100",inputfile,tempDest]);
		child.on('exit', function(code,signal){ console.log("file outputed",code);console.log("file outputed",signal);wcallback(null);});
		child.on('error', function(err){ console.log(err);wcallback(err);});
		child.stdout.pipe(file);
		child.stderr.on('data', function (data) {
			console.log('stderr: ' + data);		 
		  });   
	}, function (wcallback) {
		var exists = fs.existsSync(tempDest);
		console.log("1. is exist", exists);
		setTimeout(function () {
			var exist = fs.existsSync(tempDest);		
			var filesize=getFilesizeInBytes(tempDest);		
			if(filesize==0)
			{
				wcallback(new Error("file conversion failed return 0 byte file"));
			}
			fs.readFile((tempDest), function (err, data) {
				if (err) {
					console.log("read file error", err);
					wcallback(err);
				}
				else {					
					var param = {
						Bucket: dstBucket,
						Key: dstKey,
						Body: data,
						ContentType: "image/jp2"
					};
					s3.putObject(param, function (err, data1) {
						if (err) {
							console.log("error==" + err);
							wcallback(err);
						}
						else {							
							wcallback(null);
						}
					});

				}
			});
		}, 5000)

	}], function (error) {
		if (error) {
			exec('rm -rf ' + tmpdir + "*", function (error, stdout, stderr) { });
			context.fail(error);
			callback(error);
		}
		else {
			console.log("resizing completed");
		    exec('rm -rf ' + tmpdir + "*", function (error, stdout, stderr) { });
			context.succeed("file converted successfully");			
			callback(null);
		}
	})
};
function getFilesizeInBytes(filename) {
	var stats = fs.statSync(filename)
	var fileSizeInBytes = stats["size"]
	return fileSizeInBytes
}

