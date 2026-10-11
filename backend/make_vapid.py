"""Run once on your computer:  python make_vapid.py
Prints the value to paste into the VAPID_PRIVATE_KEY environment variable on your host.
Keep it secret. Using the same key every time means phones stay subscribed after redeploys."""
from py_vapid import Vapid

v = Vapid()
v.generate_keys()
print("VAPID_PRIVATE_KEY=" + v.private_pem().decode().strip().replace("\n", "\\n"))
