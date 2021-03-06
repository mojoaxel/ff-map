#!/usr/bin/python

import lxml.etree
import requests
import datetime
from pymongo import MongoClient
client = MongoClient()

db = client.freifunk


CONFIG = {
	"crawl_netif": "br-mesh",
	"mac_netif": "br-mesh",
	"vpn_netif": "fffVPN"
}

# create db indexes
db.routers.create_index([("position", "2dsphere")])


tree = lxml.etree.fromstring(requests.get("https://netmon.freifunk-franken.de/api/rest/routerlist", params={"limit": 5000}).content)

for r in tree.xpath("/netmon_response/routerlist/router"):
	user_netmon_id = int(r.xpath("user_id/text()")[0])
	user = db.users.find_one({"netmon_id": user_netmon_id})
	if user:
		user_id = user["_id"]
	else:
		user_id = db.users.insert({
			"netmon_id": user_netmon_id,
			"nickname": r.xpath("user/nickname/text()")[0]
		})
		user = db.users.find_one({"_id": user_id})

	router = {
		"netmon_id": int(r.xpath("router_id/text()")[0]),
		"hostname": r.xpath("hostname/text()")[0],
		"user": {"nickname": user["nickname"], "_id": user["_id"]}
	}

	try:
		lng = float(r.xpath("longitude/text()")[0])
		lat = float(r.xpath("latitude/text()")[0])
		assert lng != 0
		assert lat != 0

		router["position"] = {
			"type": "Point",
			"coordinates": [lng, lat]
		}
		
		# define hood
		router["hood"] = db.hoods.find_one({"position": {"$near": {"$geometry": router["position"]}}})["name"]

		# try to get comment
		position_comment = r.xpath("location/text()")[0]
		if position_comment != "undefined":
			router["position"]["comment"] = position_comment
	except (IndexError, AssertionError):
		pass

	try:
		router["description"] = r.xpath("description/text()")[0]
	except IndexError:
		pass

	if db.routers.find_one({"netmon_id": router["netmon_id"]}):
		print("Updating »%(hostname)s«" % router)
		db.routers.update_one({"netmon_id": router["netmon_id"]}, {"$set": router})
	else:
		print("Importing »%(hostname)s«" % router)
		# crawl HTML page for CONFIG["crawl_netif"] ip for 1st direct router crawl
		page = requests.get("https://netmon.freifunk-franken.de/router.php", params={"router_id": router["netmon_id"]}).text
		if CONFIG["crawl_netif"] in page:
			netif_ip = "fe80%s" % page.split("<b>%s</b>" % CONFIG["crawl_netif"])[1].split("fe80")[1].split("/")[0]
			router["netifs"] = [{
				"name": CONFIG["crawl_netif"],
				"ipv6_fe80_addr": netif_ip
			}]

		router["created"] = datetime.datetime.utcnow()
		router["status"] = "unknown"

		db.routers.insert_one(router)
