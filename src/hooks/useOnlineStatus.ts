import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "../firebase";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const connectedRef = ref(db, ".info/connected");

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      setIsOnline(snapshot.val() === true);
    });

    return unsubscribe;
  }, []);

  return isOnline;
}