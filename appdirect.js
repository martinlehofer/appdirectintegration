var DEBUG_MODE =	true;
var TIMEOUT =		29500;

var NS_ACCT = 'AVT';
var SUBSCRIPTION_EVENT_SUITELET_URL = '';
if (process && process.env && process.env.NS)
{
	NS_ACCT = process.env.NS;
	SUBSCRIPTION_EVENT_SUITELET_URL =  process.env['EVENT_SUITELET_URL_' + NS_ACCT];
}

var PORT = 3000;
if (process && process.env && process.env.PORT)
{
	PORT = process.env.PORT;
}

var SUBSCRIPTION_CREATE =	'SUB_CREATE';
var SUBSCRIPTION_CHANGE =	'SUB_CHANGE';
var SUBSCRIPTION_CANCEL =	'SUB_CANCEL';

var request = require('request');
var http = require('http');
var querystring = require('querystring');
var xmldoc = require('xmldoc');
var OAuth   = require('oauth-1.0a');

var keyRing = {  };
for (var k in process.env)
{
	if (k.substr(0, 'CONSUMER_KEY_'.length) == 'CONSUMER_KEY_')
	{
		var edCode = k.replace('CONSUMER_KEY_' , '');
		keyRing[edCode] =
		{
			consumer:
				{
					public:	process.env[k],
					secret:	process.env['CONSUMER_SECRET_' + edCode]
				},
			signature_method:	'HMAC-SHA1'
		}
	}
}

function log(msg)
{
	if (DEBUG_MODE)
	{
		console.log(msg);
	}
}

function dumpObj(obj)
{
	for (var p in obj)
	{
		log(p + ' = ' + obj[p]);
	}
}

function WriteResponseBack(error, httpResponse, body, serverResponse)
{
	var msg = '';

	if (!httpResponse || ((httpResponse) && httpResponse.statusCode  != 200))
	{
		if (error)
		{
			log('Request Error: "' + error + '"');
			msg = 'Problem with HB';
		}

		if (httpResponse.statusCode  != 200)
		{
			log('Server Error - Status Code: ' + httpResponse.statusCode);
		}

		msg = 'Problem with NS';
		body = new Buffer('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><result><success>false</success><errorCode>UNKNOWN_ERROR</errorCode><message>' + msg + '</message></result>', 'utf8');
	}
	else
	{
		log('XML returned from Netsuite:');
		log(body.toString());
	}

	serverResponse.writeHead(200,
	{
		'Content-Type':		'text/xml; charset=UTF-8',
		'Content-Length':	Buffer.byteLength(body.toString(), 'utf8')
	});
	serverResponse.write(body, 'utf8');
	serverResponse.end();
}

function extractXMLData(rootNode)
{
	var data = {  };

	var creatorNode = rootNode.descendantWithPath('creator');
	var companyNode = rootNode.descendantWithPath('payload.company');
	var orderNode = rootNode.descendantWithPath('payload.order');
	var accountNode = rootNode.descendantWithPath('payload.account');

	if (companyNode)
	{
		companyNode.eachChild(
			function (child, index, array)
			{
				var fieldName = 'cust_' + child.name;
				data[fieldName] = child.val;
			});
	}

	if (creatorNode)
	{
		creatorNode.eachChild(
			function (child, index, array)
			{
				var fieldName = 'cont_' + child.name;
				data[fieldName] = child.val;
			});
	}

	if (orderNode)
	{
		orderNode.eachChild(
			function (child, index, array)
			{
				if (child.name == 'item')
				{
					return;
				}

				var fieldName = 'ordr_' + child.name;
				data[fieldName] = child.val;
			});

		orderNode.eachChild(
			function (child, index, array)
			{
				if (child.name == 'item')
				{
					return;
				}

				var fieldName = 'ordr_' + child.name;
				data[fieldName] = child.val;
			});

		var itemNodes = orderNode.childrenNamed('item');
		for (var n = 0 ; n < itemNodes.length ; n++)
		{
			itemNodes[n].eachChild(
				function (child, index, array)
				{
					var fieldName = 'ordr_item_' + n + '_' + child.name;
					data[fieldName] = child.val;
				});
		}
	}

	if (accountNode)
	{
		accountNode.eachChild(
			function (child, index, array)
			{
				var fieldName = 'acct_' + child.name;
				data[fieldName] = child.val;
			});
	}

	return data;
}

function createSubscription(rawXML, serverResponse)
{
	var rootNode = new xmldoc.XmlDocument(rawXML);
	var postData = extractXMLData(rootNode);
	postData.eventType = SUBSCRIPTION_CREATE;
	postData.rawXML = rawXML;
	log('Extracted XML data:');
	dumpObj(postData);

	request(
		{
			url:		SUBSCRIPTION_EVENT_SUITELET_URL,
			method:		'POST',
			form:		postData,
			encoding:	null
		},

		function (error, httpResponse, body)
		{
			WriteResponseBack(error, httpResponse, body, serverResponse);
		});
}

function cancelSubscription(rawXML, serverResponse)
{
	var rootNode = new xmldoc.XmlDocument(rawXML);
	var postData = extractXMLData(rootNode);
	postData.eventType = SUBSCRIPTION_CANCEL;
	postData.rawXML = rawXML;
	log('Extracted XML data:');
	dumpObj(postData);

	request(
		{
			url:		SUBSCRIPTION_EVENT_SUITELET_URL,
			method:		'POST',
			form:		postData,
			encoding:	null
		},

		function (error, httpResponse, body)
		{
			WriteResponseBack(error, httpResponse, body, serverResponse);
		});
}

function changeSubscription(rawXML, serverResponse)
{
	var rootNode = new xmldoc.XmlDocument(rawXML);
	var postData = extractXMLData(rootNode);
	postData.eventType = SUBSCRIPTION_CHANGE;
	postData.rawXML = rawXML;
	log('Extracted XML data:');
	dumpObj(postData);

	request(
		{
			url:		SUBSCRIPTION_EVENT_SUITELET_URL,
			method:		'POST',
			form:		postData,
			encoding:	null
		},

		function (error, httpResponse, body)
		{
			WriteResponseBack(error, httpResponse, body, serverResponse);
		});
}

function processXML(xml, serverResponse)
{
	var type = '';
	var respXML;

	if (xml && xml !== '')
	{
		var root = new xmldoc.XmlDocument(xml);
		type = root.valueWithPath('type');

		log('Event Type Received: ' + type);

		log('Passing Event request on to: ' + SUBSCRIPTION_EVENT_SUITELET_URL);

		switch (type)
		{
			case 'SUBSCRIPTION_ORDER':
				createSubscription(xml, serverResponse);
				break;

			case 'SUBSCRIPTION_CANCEL':
				cancelSubscription(xml, serverResponse);
				break;

			case 'SUBSCRIPTION_CHANGE':
				changeSubscription(xml, serverResponse);
				break;

			// Dummy handlers to get integration accepted by AppDirect QA process
			case 'USER_ASSIGNMENT':
			case 'USER_UNASSIGNMENT':
				respXML = new Buffer('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><result><success>true</success></result>', 'utf8');
				serverResponse.writeHead(200,
					{
						'Content-Type':		'text/xml; charset=UTF-8',
						'Content-Length':	Buffer.byteLength(respXML.toString(), 'utf8')
					});
				serverResponse.write(respXML, 'utf8');
				serverResponse.end();
				break;

			default:
				respXML = new Buffer('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><result><success>false</success><errorCode>CONFIGURATION_ERROR</errorCode><message>Unsupported operation</message></result>', 'utf8');
				serverResponse.writeHead(200,
					{
						'Content-Type':		'text/xml; charset=UTF-8',
						'Content-Length':	Buffer.byteLength(respXML.toString(), 'utf8')
					});
				serverResponse.write(respXML, 'utf8');
				serverResponse.end();
				break;
		}
	}
}

try
{
	http.createServer(
		function (input, output)
		{
			var now = new Date();
			console.log('\n\n--------------------------------------------------------------------------------');
			console.log('Date: ' + now.toString());
			console.log('Received notification of event');
			console.log('--------------------------------------------------------------------------------\n\n');

			var urlParts = input.url.split('?');
			var qry = urlParts[1];
			var params = querystring.parse(qry);
			var eventUrl = '';
			var editionCode = '';
			var eventId;
			var requestData;

			if ((params.eventurl) && (params.eventurl !== ''))
			{
				eventUrl = params.eventurl;
				log('Event data at URL: "' + eventUrl + '"');

				if ((params.editioncode) && (params.editioncode !== ''))
				{
					editionCode = params.editioncode;
					log('Event for editionCode: "' + editionCode + '"');

					if (typeof keyRing[editionCode] != 'object')
					{
						log('No credentials configured for editionCode: "' + editionCode + '"');
						output.end();
						return;
					}
				}
				else
				{
					// Need to abort before trying to get event data
					// otherwise AppDirect will go into a spin
					log('Missing editioncode: skipping');
					output.end();
					return;
				}

				var eventIdStart = eventUrl.indexOf('events');
				eventIdStart += ('events/'.length);
				eventId = eventUrl.substr(eventIdStart);
				log('Event ID: ' + eventId);

				requestData =
					{
					url:		eventUrl,
					method:		'GET',
					data:		{  }
				};

				output.setTimeout(TIMEOUT,
					function ()
					{
						var errorXML = new Buffer('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><result><success>false</success><errorCode>UNKNOWN_ERROR</errorCode><message></message></result>', 'utf8');
						output.writeHead(200,
							{
								'Content-Type':		'text/xml; charset=UTF-8',
								'Content-Length':	Buffer.byteLength(errorXML.toString(), 'utf8')
							});
						output.write(errorXML, 'utf8');
						output.end();
					});

				var oauth = OAuth(keyRing[editionCode]);

				request(
					{
						url:		requestData.url,
						method:		requestData.method,
						form:		requestData.data,
						headers:	oauth.toHeader(oauth.authorize(requestData))
					},
					function (error, httpResponse, body)
					{
						if (!httpResponse)
						{
							console.log(error);
						}
						else if (httpResponse.statusCode != 200)
						{
							console.log('Network or Server error - status Code: ' + httpResponse.statusCode);
							if (body)
							{
								log(body);
							}

							body = new Buffer('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><result><success>false</success><errorCode>INVALID_RESPONSE</errorCode><message></message></result>', 'utf8');
							output.writeHead(200,
									{
										'Content-Type':		'text/xml; charset=UTF-8',
										'Content-Length':	Buffer.byteLength(body.toString(), 'utf8')
									});
							output.write(body, 'utf8');
							output.end();
						}
						else
						{
							log('Event XML Retrieved:\n');
							log(body);
							log('\n');

							// Now process the xml received
							processXML(body, output);
						}
					});
			}
			else
			{
				log('No Event URL: skipping');
				output.end();
			}
		}).listen(PORT);

	console.log('\nApp Direct Integration Web Service Started\n');
}
catch (e)
{
	console.log('App Direct Integration Web Service failed to start because:\n' + e.message);
}