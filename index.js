// Load dependencies
var express = require('express');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3').verbose();

// Initialize database
var db = new sqlite3.Database('./ridesharing.db', sqlite3.OPEN_READWRITE,
    function(err) {
        if (err)
            console.log("Failed opening DB: " + err);
    });

// Load configuration from .env file
require('dotenv').config();

// Load and initialize MesageBird SDK
var messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);

// Set up and configure the Express framework
var app = express();
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.use(bodyParser.urlencoded({ extended : true }));

// Show admin interface
app.get('/', function(req, res) {
    // Find unassigned proxy numbers
    db.all("SELECT number FROM proxy_numbers", {}, function(err, rows) {
        var proxy_numbers = rows;
        
        // Find current rides
        db.all("SELECT c.name AS customer, d.name AS driver, start, destination, datetime, p.number AS number FROM rides r JOIN customers c ON c.id = r.customer_id JOIN drivers d ON d.id = r.driver_id JOIN proxy_numbers p ON p.id = r.number_id", {}, function(err, rows) {
            var rides = rows;

            // Collect customers
            db.all("SELECT * FROM customers", {}, function(err, rows) {
                var customers = rows;
            
                // Collect drivers
                db.all("SELECT * FROM drivers", {}, function(err, rows) {
                    var drivers = rows;
                
                    // Render template
                    res.render('admin', {
                        proxy_numbers : proxy_numbers,
                        rides : rides,
                        customers : customers,
                        drivers : drivers
                    });
                });
            });
        });
    });
});

// Create a new ride
app.post('/createride', function(req, res) {
    // Find customer details
    db.get("SELECT * FROM customers WHERE id = $id", { $id : req.body.customer }, function(err, row) {
        var customer = row;

        // Find driver details
        db.get("SELECT * FROM drivers WHERE id = $id", { $id : req.body.driver }, function(err, row) {
            var driver = row;
        
            // Find a number that has not been used by the driver or the customer
            db.get("SELECT * FROM proxy_numbers "
                + "WHERE id NOT IN (SELECT number_id FROM rides WHERE customer_id = $customer) "
                + "AND id NOT IN (SELECT number_id FROM rides WHERE driver_id = $driver)", {
                    $customer : customer.id,
                    $driver : driver.id,
            }, function(err, row) {
                if (row == null) {
                    // No number found!
                    res.send("No number available! Please extend your pool.");
                } else {
                    var proxyNumber = row;

                    // Store ride in database
                    db.run("INSERT INTO rides (start, destination, datetime, customer_id, driver_id, number_id) VALUES ($start, $destination, $datetime, $customer, $driver,$number)", {
                        $start : req.body.start,
                        $destination : req.body.destination,
                        $datetime : req.body.datetime,
                        $customer : customer.id,
                        $driver : driver.id,
                        $number : proxyNumber.id
                    });

                    // Notify the customer
                    messagebird.messages.create({
                        originator : proxyNumber.number,
                        recipients : [ customer.number ],
                        body : driver.name + " will pick you up at " + req.body.datetime + ". Reply to this message to contact the driver."
                    }, function(err, response) {
                        console.log(err, response);
                    });

                    // Notify the driver
                    messagebird.messages.create({
                        originator : proxyNumber.number,
                        recipients : [ driver.number ],
                        body : customer.name + " will wait for you at " + req.body.datetime + ". Reply to this message to contact the customer."
                    }, function(err, response) {
                        console.log(err, response);
                    });

                    // Redirect back to previous view
                    res.redirect('/');
                }                    
            });
        });
    });
});

// Handle incoming messages
app.post('/webhook', function(req, res) {
    // Read input sent from MessageBird
    var number = req.body.originator;
    var text = req.body.payload;
    var proxy = req.body.recipient;

    db.get("SELECT c.number AS customer_number, d.number AS driver_number, p.number AS proxy_number "
        + "FROM rides r JOIN customers c ON r.customer_id = c.id JOIN drivers d ON r.driver_id = d.id JOIN proxy_numbers p ON p.id = r.number_id "
        + "WHERE proxy_number = $proxy AND (driver_number = $number OR customer_number = $number)", {
            $number : number,
            $proxy : proxy
        }, function(err, row) {
            if (row) {
                // Got a match!
                // Need to find out whether customer or driver sent this and forward to the other side
                var recipient = "";
                if (number == row.customer_number)
                    recipient = row.driver_number;
                else
                if (number == row.driver_number)
                    recipient = row.customer_number;
                
                // Forward the message through the MessageBird API
                messagebird.messages.create({
                    originator : proxy,
                    recipients : [ recipient ],
                    body : text
                }, function(err, response) {
                    console.log(err, response);
                });
            } else {
                // Cannot match numbers
                console.log("Could not find a ride for customer/driver " + number + " that uses proxy " + proxy + ".");
            }
        });

    // Return any response, MessageBird won't parse this
    res.send("OK");
});

// Handle incoming calls
app.get('/webhook-voice', function(req, res) {
    // Read input sent from MessageBird
    var number = req.query.source;
    var proxy = req.query.destination;

    // Answer will always be XML
    res.set('Content-Type', 'application/xml');
    
    db.get("SELECT c.number AS customer_number, d.number AS driver_number, p.number AS proxy_number "
        + "FROM rides r JOIN customers c ON r.customer_id = c.id JOIN drivers d ON r.driver_id = d.id JOIN proxy_numbers p ON p.id = r.number_id "
        + "WHERE proxy_number = $proxy AND (driver_number = $number OR customer_number = $number)", {
            $number : number,
            $proxy : proxy
        }, function(err, row) {
            if (row) {
                // Got a match!
                // Need to find out whether customer or driver sent this and forward to the other side
                var recipient = "";
                if (number == row.customer_number)
                    recipient = row.driver_number;
                else
                if (number == row.driver_number)
                    recipient = row.customer_number;
                
                // Create call flow to instruct transfer
                console.log("Transferring call to " + recipient);
                res.send('<?xml version="1.0" encoding="UTF-8"?>'
                    + '<Transfer destination="' + recipient + '" mask="true" />');
            } else {
                // Cannot match numbers
                res.send('<?xml version="1.0" encoding="UTF-8"?>'
                    + '<Say language="en-GB" voice="female">Sorry, we cannot identify your transaction. Make sure you call in from the number you registered.</Say>');
            }
        });
});

// Start the application
app.listen(8080);