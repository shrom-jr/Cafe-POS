import { usePOSStore } from '@/store/usePOSStore';

export const useOrders = () => {
  const orders = usePOSStore((s) => s.orders);
  const getActiveOrder = usePOSStore((s) => s.getActiveOrder);
  const createOrder = usePOSStore((s) => s.createOrder);
  const addItemToOrder = usePOSStore((s) => s.addItemToOrder);
  const updateItemQuantity = usePOSStore((s) => s.updateItemQuantity);
  const removeItemFromOrder = usePOSStore((s) => s.removeItemFromOrder);
  const updateOrderStatus = usePOSStore((s) => s.updateOrderStatus);
  const sendToKitchen = usePOSStore((s) => s.sendToKitchen);
  const getNextKotNumber = usePOSStore((s) => s.getNextKotNumber);
  const clearOrder = usePOSStore((s) => s.clearOrder);
  const addPayment = usePOSStore((s) => s.addPayment);

  return {
    orders,
    getActiveOrder,
    createOrder,
    addItemToOrder,
    updateItemQuantity,
    removeItemFromOrder,
    updateOrderStatus,
    sendToKitchen,
    getNextKotNumber,
    clearOrder,
    addPayment,
  };
};
